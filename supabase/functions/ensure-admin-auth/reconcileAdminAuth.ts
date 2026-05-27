export interface AdminUserSummary {
  id: string
  email?: string | null
}

export interface EnsureAdminAuthClient {
  auth: {
    admin: {
      listUsers: () => Promise<{
        data: { users: AdminUserSummary[] }
        error: { message: string } | null
      }>
      createUser: (payload: {
        email: string
        password: string
        email_confirm: boolean
        user_metadata: { name: string; vault_name: string }
      }) => Promise<{ error: { message: string } | null }>
      updateUserById: (
        userId: string,
        payload: { email_confirm: boolean; password: string },
      ) => Promise<{ error: { message: string } | null }>
    }
  }
}

export async function reconcileAdminAuthAccount(
  client: EnsureAdminAuthClient,
  adminAuthEmail: string,
  password: string,
): Promise<void> {
  const { data: listData, error: listError } = await client.auth.admin.listUsers()
  if (listError) {
    throw new Error(`Failed to list users: ${listError.message}`)
  }

  const adminUser = listData.users.find((user) => user.email === adminAuthEmail)

  if (!adminUser) {
    const { error: createError } = await client.auth.admin.createUser({
      email: adminAuthEmail,
      password,
      email_confirm: true,
      user_metadata: { name: 'Administrator', vault_name: 'WatchVault' },
    })
    if (createError) {
      throw new Error(`Failed to create admin user: ${createError.message}`)
    }
    return
  }

  const { error: updateError } = await client.auth.admin.updateUserById(adminUser.id, {
    email_confirm: true,
    password,
  })
  if (updateError) {
    throw new Error(`Failed to reconcile admin user: ${updateError.message}`)
  }
}
