import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const ENDPOINT = 'https://models.inference.ai.azure.com/chat/completions'
const AUTO_MODEL = 'auto'

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
  rebalancing: 'gpt-4o',
}

type GitHubModelsRequest = {
  prompt?: unknown
  model?: unknown
  jsonMode?: unknown
  taskType?: unknown
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

async function recordUsageIfAuthenticated(req: Request, taskType: string, totalTokens: number) {
  const authorization = req.headers.get('Authorization')

  if (!authorization || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  await supabase.rpc('record_ai_usage', {
    p_call_type: taskType,
    p_tokens: totalTokens,
    p_usage_date: null,
    p_increment: 1,
  })
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

  if (!prompt) {
    return jsonResponse(400, { error: 'Prompt is required.' })
  }

  const model = resolveModel(taskType, requestedModel)

  const upstreamResponse = await fetch(ENDPOINT, {
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

  if (!upstreamResponse.ok) {
    const errorText = await upstreamResponse.text()
    return jsonResponse(upstreamResponse.status, {
      error: `GitHub Models request failed: ${errorText || upstreamResponse.statusText}`,
    })
  }

  const payload = await upstreamResponse.json()
  const content = extractContent(payload?.choices?.[0]?.message?.content)

  if (!content) {
    return jsonResponse(502, { error: 'GitHub Models returned no message content.' })
  }

  const usage = {
    promptTokens:
      typeof payload?.usage?.prompt_tokens === 'number'
        ? payload.usage.prompt_tokens
        : estimateTokens(prompt),
    completionTokens:
      typeof payload?.usage?.completion_tokens === 'number'
        ? payload.usage.completion_tokens
        : estimateTokens(content),
    totalTokens:
      typeof payload?.usage?.total_tokens === 'number'
        ? payload.usage.total_tokens
        : estimateTokens(prompt) + estimateTokens(content),
  }

  try {
    await recordUsageIfAuthenticated(req, taskType, usage.totalTokens)
  } catch (error) {
    console.error('Failed to record AI usage', error)
  }

  return jsonResponse(200, {
    content,
    model,
    usage,
  })
})
