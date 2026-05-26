import { createClient } from '@supabase/supabase-js'

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function preview(text, limit = 240) {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > limit ? `${compact.slice(0, limit)}…` : compact
}

function extractJsonPayload(response) {
  const trimmed = response.trim()
  const fenced = trimmed.match(/```(?:[a-z0-9_-]+)?\s*([\s\S]*?)\s*```/i)
  return fenced ? fenced[1].trim() : trimmed
}

function parseJsonWithRecovery(payload) {
  try {
    return JSON.parse(payload)
  } catch {
    // Continue with extraction recovery paths.
  }

  const candidates = [
    [payload.indexOf('{'), payload.lastIndexOf('}')],
    [payload.indexOf('['), payload.lastIndexOf(']')],
  ]
    .filter(([start, end]) => start >= 0 && end > start)
    .sort((a, b) => a[0] - b[0])

  for (const [start, end] of candidates) {
    try {
      return JSON.parse(payload.slice(start, end + 1))
    } catch {
      // Try next extraction candidate.
    }
  }

  throw new Error('Response did not contain valid JSON.')
}

const supabaseUrl = requireEnv('SUPABASE_URL')
const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY')
const identifyImageUrl =
  process.env.AI_TEST_IMAGE_URL?.trim() ||
  'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800'

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

const testCases = [
  {
    taskType: 'general',
    prompt: 'In one short sentence, explain why tracking watch service history matters.',
    jsonMode: false,
  },
  {
    taskType: 'chat',
    prompt: 'Give one concise tip for first-time vintage watch buyers.',
    jsonMode: false,
  },
  {
    taskType: 'signal',
    prompt:
      'Return JSON with keys signal and rationale for a watch that recently rose 8% in value and has high demand.',
    jsonMode: true,
  },
  {
    taskType: 'deal_assessment',
    prompt:
      'Return JSON with keys verdict and summary for this listing: Rolex Submariner 124060, excellent condition, asking $8,900.',
    jsonMode: true,
  },
  {
    taskType: 'deal_ranking',
    prompt:
      'Return JSON with ranked_deals array for these deal ids [A,B,C] and include one-line reason for each.',
    jsonMode: true,
  },
  {
    taskType: 'rebalancing',
    prompt:
      'Return JSON with recommended_actions array to rebalance a collection that is 80% sport steel watches.',
    jsonMode: true,
  },
  {
    taskType: 'what_if',
    prompt:
      'Return JSON with impact and recommendation for selling one watch to free $5,000 in cash.',
    jsonMode: true,
  },
  {
    taskType: 'identify',
    prompt: 'Identify this watch image and return JSON with brand, model, and confidence.',
    jsonMode: true,
    imageInput: identifyImageUrl,
  },
]

async function run() {
  console.log(`Running ${testCases.length} live AI function checks against ${supabaseUrl}...`)

  for (const testCase of testCases) {
    const requestBody = {
      prompt: testCase.prompt,
      taskType: testCase.taskType,
      jsonMode: testCase.jsonMode,
      ...(testCase.imageInput ? { imageInput: testCase.imageInput } : {}),
    }

    const { data, error } = await supabase.functions.invoke('github-models-proxy', {
      body: requestBody,
    })

    if (error) {
      throw new Error(`Task "${testCase.taskType}" failed: ${error.message}`)
    }

    const content = typeof data?.content === 'string' ? data.content.trim() : ''
    if (!content) {
      throw new Error(`Task "${testCase.taskType}" returned empty content.`)
    }

    if (testCase.jsonMode) {
      parseJsonWithRecovery(extractJsonPayload(content))
    }

    console.log(`✅ ${testCase.taskType}`)
    console.log(`   model: ${data?.model || 'unknown'}`)
    console.log(`   tokens: ${data?.usage?.totalTokens ?? 'unknown'}`)
    console.log(`   response: ${preview(content)}`)
  }

  console.log('✅ All AI live function checks passed.')
}

try {
  await run()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`❌ AI live function test failed: ${message}`)
  process.exit(1)
}
