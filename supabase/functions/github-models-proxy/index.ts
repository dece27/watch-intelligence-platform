import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const ENDPOINT = 'https://models.inference.ai.azure.com/chat/completions'
const AUTO_MODEL = 'auto'
const DEFAULT_CACHE_TTL_SECONDS = 60 * 60 * 6
const MAX_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL_ROUTES: Record<string, string> = {
  general: 'gpt-4o-mini',
  chat: 'gpt-4o-mini',
  signal: 'gpt-4o-mini',
  deal_assessment: 'gpt-4o-mini',
  deal_ranking: 'gpt-4o-mini',
  what_if: 'gpt-4o-mini',
  identify: 'gpt-4o',
  rebalancing: 'gpt-4o-mini',
}

type GitHubModelsRequest = {
  prompt?: unknown
  model?: unknown
  jsonMode?: unknown
  taskType?: unknown
  cacheKey?: unknown
  cacheTtlSeconds?: unknown
}

type CachedAiPayload = {
  content: string
  model: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function estimateTokens(text: string) {
  return Math.ceil(new TextEncoder().encode(text).length / 4)
}

function resolveUsageCallType(taskType: string) {
  switch (taskType) {
    case 'what_if':
      return 'chat'
    case 'deal_ranking':
      return 'deal_assessment'
    default:
      return taskType
  }
}

function getServiceRoleClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function getCachedResponse(cacheKey: string): Promise<CachedAiPayload | null> {
  const supabase = getServiceRoleClient()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('market_data_cache')
    .select('data, expires_at')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error) {
    console.error('Failed to read AI cache', error)
    return null
  }

  const payload = data?.data
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const cached = payload as Partial<CachedAiPayload>
  if (
    typeof cached.content !== 'string' ||
    typeof cached.model !== 'string' ||
    !cached.usage ||
    typeof cached.usage.totalTokens !== 'number'
  ) {
    return null
  }

  return cached as CachedAiPayload
}

async function setCachedResponse(cacheKey: string, cacheTtlSeconds: number, payload: CachedAiPayload) {
  const supabase = getServiceRoleClient()
  if (!supabase) {
    return
  }

  const expiresAt = new Date(Date.now() + (cacheTtlSeconds * 1000)).toISOString()
  const { error } = await supabase
    .from('market_data_cache')
    .upsert(
      {
        cache_key: cacheKey,
        data: payload,
        source: 'github_models_proxy',
        expires_at: expiresAt,
      },
      { onConflict: 'cache_key' },
    )

  if (error) {
    console.error('Failed to write AI cache', error)
  }
}

function resolveModel(taskType: string, requestedModel?: string) {
  if (requestedModel && requestedModel !== AUTO_MODEL) {
    return requestedModel
  }

  return MODEL_ROUTES[taskType] ?? MODEL_ROUTES.general
}

function extractContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }

        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text
        }

        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

async function verifyAuthenticatedCaller(authorizationHeader: string | null) {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return { userId: null, error: jsonResponse(401, { error: 'Missing bearer authorization token.' }) }
  }

  const accessToken = authorizationHeader.replace(/^Bearer\s+/i, '').trim()
  if (!accessToken) {
    return { userId: null, error: jsonResponse(401, { error: 'Missing bearer authorization token.' }) }
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { userId: null, error: jsonResponse(500, { error: 'Supabase auth configuration is missing.' }) }
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data, error } = await authClient.auth.getUser(accessToken)
  if (error || !data.user) {
    return { userId: null, error: jsonResponse(401, { error: 'Invalid or expired Supabase auth token.' }) }
  }

  return { userId: data.user.id, error: null }
}

async function recordUsageForCaller(authorizationHeader: string, taskType: string, totalTokens: number) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authorizationHeader,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { error } = await supabase.rpc('record_ai_usage', {
    p_call_type: resolveUsageCallType(taskType),
    p_tokens: totalTokens,
    p_usage_date: null,
    p_increment: 1,
  })

  if (error) {
    throw error
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' })
  }

  if (!GITHUB_TOKEN) {
    return jsonResponse(500, { error: 'Missing GITHUB_TOKEN environment variable.' })
  }

  const authorization = req.headers.get('Authorization')
  const authCheck = await verifyAuthenticatedCaller(authorization)
  if (authCheck.error) {
    return authCheck.error
  }

  let body: GitHubModelsRequest
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { error: 'Request body must be valid JSON.' })
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const requestedModel = typeof body.model === 'string' ? body.model.trim() : undefined
  const jsonMode = body.jsonMode === true
  const taskType = typeof body.taskType === 'string' && body.taskType.trim()
    ? body.taskType.trim()
    : 'general'
  const cacheKey = typeof body.cacheKey === 'string' ? body.cacheKey.trim() : ''
  const rawCacheTtl = typeof body.cacheTtlSeconds === 'number' ? body.cacheTtlSeconds : DEFAULT_CACHE_TTL_SECONDS
  const cacheTtlSeconds = Math.min(Math.max(Math.round(rawCacheTtl), 0), MAX_CACHE_TTL_SECONDS)

  if (!prompt) {
    return jsonResponse(400, { error: 'Prompt is required.' })
  }

  if (cacheKey) {
    const cached = await getCachedResponse(cacheKey)
    if (cached) {
      return jsonResponse(200, {
        content: cached.content,
        model: cached.model,
        usage: cached.usage,
        cached: true,
      })
    }
  }

  const model = resolveModel(taskType, requestedModel)

  let upstreamResponse: Response
  try {
    upstreamResponse = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: jsonMode ? 0.2 : 0.7,
        response_format: jsonMode ? { type: 'json_object' } : undefined,
      }),
    })
  } catch (error) {
    return jsonResponse(502, {
      error: `GitHub Models request failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }

  if (!upstreamResponse.ok) {
    const errorText = await upstreamResponse.text()
    if (upstreamResponse.status === 429 || /rate limit|quota/i.test(errorText)) {
      return jsonResponse(429, {
        error: 'Daily GitHub Models quota exhausted.',
        errorCode: 'daily_limit_exhausted',
      })
    }

    return jsonResponse(upstreamResponse.status, {
      error: `GitHub Models request failed: ${errorText || upstreamResponse.statusText}`,
    })
  }

  let payload: unknown
  try {
    payload = await upstreamResponse.json()
  } catch {
    return jsonResponse(502, { error: 'GitHub Models returned malformed JSON.' })
  }

  const content = extractContent((payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content)

  if (!content) {
    return jsonResponse(502, { error: 'GitHub Models returned no message content.' })
  }

  const usage = {
    promptTokens:
      typeof (payload as { usage?: { prompt_tokens?: unknown } })?.usage?.prompt_tokens === 'number'
        ? (payload as { usage: { prompt_tokens: number } }).usage.prompt_tokens
        : estimateTokens(prompt),
    completionTokens:
      typeof (payload as { usage?: { completion_tokens?: unknown } })?.usage?.completion_tokens === 'number'
        ? (payload as { usage: { completion_tokens: number } }).usage.completion_tokens
        : estimateTokens(content),
    totalTokens:
      typeof (payload as { usage?: { total_tokens?: unknown } })?.usage?.total_tokens === 'number'
        ? (payload as { usage: { total_tokens: number } }).usage.total_tokens
        : estimateTokens(prompt) + estimateTokens(content),
  }

  const responsePayload = {
    content,
    model,
    usage,
  }

  if (cacheKey && cacheTtlSeconds > 0) {
    await setCachedResponse(cacheKey, cacheTtlSeconds, responsePayload)
  }

  try {
    await recordUsageForCaller(authorization as string, taskType, usage.totalTokens)
  } catch (error) {
    console.error('Failed to record AI usage', error)
  }

  return jsonResponse(200, responsePayload)
})
