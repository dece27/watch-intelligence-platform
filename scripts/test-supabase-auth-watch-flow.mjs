import { createClient } from '@supabase/supabase-js'

function requireEnv(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) {
      return value
    }
  }
  throw new Error(`Missing required environment variable. Checked: ${names.join(', ')}`)
}

function optionalEnv(name, fallback) {
  return process.env[name]?.trim() || fallback
}

function decodeJwtPayload(token, keyName) {
  const parts = token.split('.')
  if (parts.length < 2) {
    throw new Error(`${keyName} is not a valid JWT token`)
  }

  const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)

  let decoded
  try {
    decoded = Buffer.from(padded, 'base64').toString('utf8')
  } catch {
    throw new Error(`${keyName} JWT payload could not be base64-decoded`)
  }

  try {
    return JSON.parse(decoded)
  } catch {
    throw new Error(`${keyName} JWT payload is not valid JSON`)
  }
}

function normalizeHostFromUrl(value, label) {
  try {
    return new URL(value).host.toLowerCase()
  } catch {
    throw new Error(`${label} is not a valid URL: ${value}`)
  }
}

function getProjectRefFromHost(host, label) {
  const hostname = host.toLowerCase()
  const [projectRef] = hostname.split('.')
  if (!projectRef) {
    throw new Error(`${label} does not include a valid Supabase project host: ${host}`)
  }
  return projectRef
}

function getProjectRefFromJwt(token, keyName) {
  const payload = decodeJwtPayload(token, keyName)
  if (!payload?.iss || typeof payload.iss !== 'string') {
    throw new Error(`${keyName} is missing a valid "iss" claim`)
  }

  const issuer = payload.iss.trim().toLowerCase()
  if (issuer === 'supabase') {
    if (!payload?.ref || typeof payload.ref !== 'string') {
      throw new Error(`${keyName} has legacy iss="supabase" but is missing a valid "ref" claim`)
    }
    return payload.ref.trim().toLowerCase()
  }

  const issuerHost = normalizeHostFromUrl(payload.iss, `${keyName} iss claim`)
  return getProjectRefFromHost(issuerHost, `${keyName} iss claim`)
}

function assertSupabaseProjectAlignment({ supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey }) {
  const urlHost = normalizeHostFromUrl(supabaseUrl, 'SUPABASE_URL')
  const urlProjectRef = getProjectRefFromHost(urlHost, 'SUPABASE_URL')
  const anonProjectRef = getProjectRefFromJwt(supabaseAnonKey, 'SUPABASE_ANON_KEY')
  const serviceProjectRef = getProjectRefFromJwt(supabaseServiceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY')

  if (anonProjectRef !== serviceProjectRef || anonProjectRef !== urlProjectRef) {
    throw new Error(
      [
        'Supabase configuration mismatch detected.',
        `SUPABASE_URL host: ${urlHost}`,
        `SUPABASE_URL project ref: ${urlProjectRef}`,
        `SUPABASE_ANON_KEY project ref: ${anonProjectRef}`,
        `SUPABASE_SERVICE_ROLE_KEY project ref: ${serviceProjectRef}`,
        'Ensure all three values point to the same Supabase project in the selected GitHub Environment.',
      ].join(' '),
    )
  }

  return urlHost
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function expectNoError(error, context) {
  if (error) {
    throw new Error(`${context}: ${error.message}`)
  }
}

function isAlreadyRegisteredError(error) {
  if (!error?.message) return false
  const message = error.message.toLowerCase()
  return message.includes('already been registered') || message.includes('already registered')
}

function createAnonClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

function createServiceClient(url, serviceRoleKey) {
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

async function assertRequiredTablesExist({ serviceClient, tableNames, projectHost }) {
  const missingTables = []

  for (const tableName of tableNames) {
    const { error } = await serviceClient.from(tableName).select('id').limit(1)
    if (!error) {
      continue
    }

    const errorMessage = (error.message || '').toLowerCase()
    const isMissingTable =
      errorMessage.includes(`could not find the table 'public.${tableName}'`) ||
      errorMessage.includes(`relation "public.${tableName}" does not exist`)

    if (isMissingTable) {
      missingTables.push(tableName)
      continue
    }

    throw new Error(`Schema preflight failed while checking public.${tableName}: ${error.message}`)
  }

  if (missingTables.length > 0) {
    throw new Error(
      [
        `Required schema tables are missing in Supabase project "${projectHost}": ${missingTables.map((name) => `public.${name}`).join(', ')}.`,
        'This usually means database migrations were not applied to this project.',
        "Apply migrations to this project (for example with `supabase db push`) and rerun the workflow.",
      ].join(' '),
    )
  }
}

async function ensureDummyUserCanLogin({ anonClient, serviceClient, email, password, displayName }) {
  const signInResult = await anonClient.auth.signInWithPassword({ email, password })
  if (!signInResult.error && signInResult.data.user) {
    return signInResult.data.user
  }

  const { error: createError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: displayName,
      display_name: displayName,
      vault_name: 'E2E Test Vault',
    },
  })

  if (createError && !isAlreadyRegisteredError(createError)) {
    throw new Error(`Failed to create dummy user: ${createError.message}`)
  }

  const secondSignIn = await anonClient.auth.signInWithPassword({ email, password })
  if (secondSignIn.error || !secondSignIn.data.user) {
    throw new Error(
      `Failed to log in dummy user after creation attempt: ${secondSignIn.error?.message || 'Unknown sign-in error'}`,
    )
  }

  return secondSignIn.data.user
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
  const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const dummyEmail = optionalEnv('WATCH_E2E_EMAIL', 'dummy.watch.e2e@example.com')
  const dummyPassword = optionalEnv('WATCH_E2E_PASSWORD', 'DummyPassphrase42!')
  const dummyDisplayName = optionalEnv('WATCH_E2E_NAME', 'Dummy Watch Tester')

  const anonClient = createAnonClient(supabaseUrl, supabaseAnonKey)
  const serviceClient = createServiceClient(supabaseUrl, supabaseServiceRoleKey)

  console.log('0) Validating Supabase project configuration and schema...')
  const projectHost = assertSupabaseProjectAlignment({
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
  })
  await assertRequiredTablesExist({
    serviceClient,
    tableNames: ['profiles', 'user_preferences', 'watches'],
    projectHost,
  })

  console.log('1) Logging in dummy user (creating account if missing)...')
  const user = await ensureDummyUserCanLogin({
    anonClient,
    serviceClient,
    email: dummyEmail,
    password: dummyPassword,
    displayName: dummyDisplayName,
  })

  assert(user.email === dummyEmail, 'Logged-in user email does not match dummy email')

  console.log('2) Verifying user is present in Supabase auth/profiles...')
  const { data: authUserResponse, error: authUserError } = await serviceClient.auth.admin.getUserById(user.id)
  expectNoError(authUserError, 'Failed to fetch auth user')
  assert(authUserResponse?.user?.email === dummyEmail, 'Supabase auth user email mismatch')

  const { data: profileRow, error: profileError } = await serviceClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  expectNoError(profileError, 'Failed to fetch profile row')
  assert(profileRow.id === user.id, 'Profile row does not belong to logged-in user')

  const { data: preferencesRow, error: preferencesError } = await serviceClient
    .from('user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single()
  expectNoError(preferencesError, 'Failed to fetch user_preferences row')
  assert(preferencesRow.user_id === user.id, 'user_preferences row does not belong to logged-in user')

  console.log('3) Creating an example watch with full metadata and photo URL...')
  const suffix = Date.now()
  const watchReference = `E2E-REF-${suffix}`
  const watchSerial = `E2E-SN-${suffix}`
  const watchPhotoUrl = 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800'

  const watchInsert = {
    user_id: user.id,
    brand: 'Omega',
    model: 'Speedmaster Professional',
    reference: watchReference,
    year: 2024,
    condition: 'Excellent',
    has_box: true,
    has_papers: true,
    purchase_price: 7800,
    purchase_date: '2024-04-01',
    purchase_currency: 'USD',
    serial_number: watchSerial,
    notes: 'Created by Supabase auth/watch E2E test script.',
    cover_photo_url: watchPhotoUrl,
    category: 'chronograph',
    movement: 'Manual',
    case_material: 'Stainless Steel',
    case_diameter: '42mm',
  }

  const { data: createdWatch, error: createWatchError } = await anonClient
    .from('watches')
    .insert(watchInsert)
    .select('*')
    .single()
  expectNoError(createWatchError, 'Failed to create watch')
  assert(createdWatch.user_id === user.id, 'Created watch user_id mismatch')

  console.log('4) Checking watch and user data persisted correctly in Supabase DB...')
  const { data: dbWatch, error: dbWatchError } = await serviceClient
    .from('watches')
    .select('*')
    .eq('id', createdWatch.id)
    .single()
  expectNoError(dbWatchError, 'Failed to fetch created watch from DB')

  assert(dbWatch.brand === watchInsert.brand, 'Stored watch brand mismatch')
  assert(dbWatch.model === watchInsert.model, 'Stored watch model mismatch')
  assert(dbWatch.reference === watchInsert.reference, 'Stored watch reference mismatch')
  assert(dbWatch.serial_number === watchInsert.serial_number, 'Stored watch serial mismatch')
  assert(dbWatch.condition === watchInsert.condition, 'Stored watch condition mismatch')
  assert(dbWatch.cover_photo_url === watchInsert.cover_photo_url, 'Stored watch photo URL mismatch')
  assert(dbWatch.category === watchInsert.category, 'Stored watch category mismatch')
  assert(dbWatch.movement === watchInsert.movement, 'Stored watch movement mismatch')
  assert(dbWatch.case_material === watchInsert.case_material, 'Stored watch case material mismatch')
  assert(dbWatch.case_diameter === watchInsert.case_diameter, 'Stored watch case diameter mismatch')

  console.log('5) Logging out and logging in again...')
  const { error: signOutError } = await anonClient.auth.signOut()
  expectNoError(signOutError, 'Failed to sign out after first login')

  const secondLogin = await anonClient.auth.signInWithPassword({
    email: dummyEmail,
    password: dummyPassword,
  })
  if (secondLogin.error || !secondLogin.data.user) {
    throw new Error(`Failed to log in again: ${secondLogin.error?.message || 'Unknown sign-in error'}`)
  }

  console.log('6) Verifying data loads again from Supabase after re-login...')
  const { data: reloadedProfile, error: reloadedProfileError } = await anonClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  expectNoError(reloadedProfileError, 'Failed to reload profile after re-login')
  assert(reloadedProfile.id === user.id, 'Reloaded profile user id mismatch')

  const { data: reloadedWatch, error: reloadedWatchError } = await anonClient
    .from('watches')
    .select('*')
    .eq('id', createdWatch.id)
    .is('deleted_at', null)
    .single()
  expectNoError(reloadedWatchError, 'Failed to reload watch after re-login')
  assert(reloadedWatch.reference === watchInsert.reference, 'Reloaded watch reference mismatch')
  assert(reloadedWatch.cover_photo_url === watchInsert.cover_photo_url, 'Reloaded watch photo mismatch')

  console.log('7) Deleting the created watch and validating deletion...')
  const { data: softDeletedWatch, error: softDeleteError } = await anonClient
    .from('watches')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', createdWatch.id)
    .is('deleted_at', null)
    .select('*')
    .single()
  expectNoError(softDeleteError, 'Failed to soft-delete watch')
  assert(Boolean(softDeletedWatch.deleted_at), 'Soft-deleted watch is missing deleted_at timestamp')

  const { data: activeWatchAfterDelete, error: activeWatchAfterDeleteError } = await anonClient
    .from('watches')
    .select('*')
    .eq('id', createdWatch.id)
    .is('deleted_at', null)
    .maybeSingle()
  expectNoError(activeWatchAfterDeleteError, 'Failed to verify watch absence after soft delete')
  assert(activeWatchAfterDelete === null, 'Deleted watch is still returned as active')

  const { data: deletedWatchFromDb, error: deletedWatchFromDbError } = await serviceClient
    .from('watches')
    .select('id, deleted_at')
    .eq('id', createdWatch.id)
    .single()
  expectNoError(deletedWatchFromDbError, 'Failed to fetch deleted watch from service client')
  assert(Boolean(deletedWatchFromDb.deleted_at), 'Service DB check shows deleted_at is still null')

  console.log('8) Final logout...')
  const { error: finalSignOutError } = await anonClient.auth.signOut()
  expectNoError(finalSignOutError, 'Failed to sign out at end of flow')

  console.log('✅ Supabase dummy-user login/create, watch create/verify, re-login/reload, delete, and logout flow passed.')
}

await main()
