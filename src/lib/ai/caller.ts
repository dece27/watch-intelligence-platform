import type { GitHubModelsTaskType } from '@/lib/github-models-proxy'
import { recordAiUsage, resolveCurrentUserId } from '@/lib/ai/usage'
import { getSupabaseClient } from '@/lib/supabase/client'

const DEFAULT_CACHE_TTL_SECONDS = 60 * 60 * 6
const AI_DEBUG_EVENT = 'ai-call-debug'

export class DailyLimitError extends Error {
  constructor(message = 'Daily AI quota exhausted.', cause?: unknown) {
    super(message)
    this.name = 'DailyLimitError'
    if (cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = cause
    }
  }
}

export interface CallAIOptions {
  prompt: string
  model?: string
  jsonMode?: boolean
  taskType?: GitHubModelsTaskType
  cacheKey?: string
  cacheTtlSeconds?: number
}

interface GitHubModelsProxyResponse {
  content?: string
  model?: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  error?: string
  errorCode?: string
}

interface AIDebugEventDetail {
  id: string
  phase: 'start' | 'success' | 'error'
  taskType: GitHubModelsTaskType
  model: string
  cacheKey?: string
  durationMs?: number
  status?: number
  error?: string
  timestamp: string
}

function emitAIDebug(detail: AIDebugEventDetail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return
  }

  window.dispatchEvent(new CustomEvent(AI_DEBUG_EVENT, { detail }))
}

function extractJsonPayload(response: string) {
  const trimmed = response.trim()
  const fenced = trimmed.match(/```(?:[a-z0-9_-]+)?\s*([\s\S]*?)\s*```/i)
  return fenced ? fenced[1].trim() : trimmed
}

function parseJsonWithRecovery<T>(payload: string): T {
  try {
    return JSON.parse(payload) as T
  } catch {
    // Continue with fallback extraction paths below.
  }

  const candidates = [
    [payload.indexOf('{'), payload.lastIndexOf('}')],
    [payload.indexOf('['), payload.lastIndexOf(']')],
  ]
    .filter(([start, end]) => start >= 0 && end > start)
    .sort((a, b) => a[0] - b[0])

  for (const [start, end] of candidates) {
    try {
      return JSON.parse(payload.slice(start, end + 1)) as T
    } catch {
      // Try the next extraction candidate.
    }
  }

  throw new Error('Response did not contain valid JSON.')
}

async function recordUsageForActiveUser(prompt: string, response: string) {
  const userId = await resolveCurrentUserId()
  if (userId) {
    await recordAiUsage(userId, prompt, response)
  }
}

function getPublicSupabaseUrl() {
  const processEnv = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> }
  }).process?.env

  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env

  return processEnv?.NEXT_PUBLIC_SUPABASE_URL
    || viteEnv?.NEXT_PUBLIC_SUPABASE_URL
    || viteEnv?.VITE_SUPABASE_URL
}

function normalizeResponseError(payload: unknown, status: number): Error {
  const data = (payload && typeof payload === 'object') ? payload as GitHubModelsProxyResponse : null
  const message = data?.error || `GitHub Models proxy request failed with status ${status}.`

  if (status === 429 || data?.errorCode === 'daily_limit_exhausted') {
    return new DailyLimitError(message)
  }

  return Object.assign(new Error(message), {
    status,
    code: data?.errorCode,
  })
}

export function parseAIJson<T>(response: string): T {
  return parseJsonWithRecovery<T>(extractJsonPayload(response))
}

export function hashAIInput(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

export function createAICacheKey(feature: string, ...parts: Array<string | number | boolean | null | undefined>) {
  return ['ai', feature, ...parts.filter((part) => part !== null && part !== undefined).map(String)].join(':')
}

export function getTodayCacheBucket(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

export async function callAI({
  prompt,
  model = 'auto',
  jsonMode = false,
  taskType = 'general',
  cacheKey,
  cacheTtlSeconds = DEFAULT_CACHE_TTL_SECONDS,
}: CallAIOptions): Promise<string> {
  const callId = crypto.randomUUID()
  const startedAt = performance.now()

  emitAIDebug({
    id: callId,
    phase: 'start',
    taskType,
    model,
    cacheKey,
    timestamp: new Date().toISOString(),
  })

  try {
    const supabaseUrl = getPublicSupabaseUrl()
    if (!supabaseUrl) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable.')
    }

    const supabase = getSupabaseClient()
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      throw sessionError
    }

    const accessToken = sessionData.session?.access_token
    if (!accessToken) {
      throw new Error('Authenticated Supabase session is required before calling AI features.')
    }

    const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/github-models-proxy`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        prompt,
        model,
        jsonMode,
        taskType,
        cacheKey,
        cacheTtlSeconds,
      }),
    })

    const payloadText = await response.text()
    let payload: GitHubModelsProxyResponse | null = null

    if (payloadText.trim()) {
      try {
        payload = JSON.parse(payloadText) as GitHubModelsProxyResponse
      } catch {
        if (!response.ok) {
          throw Object.assign(new Error(payloadText), { status: response.status })
        }
      }
    }

    if (!response.ok) {
      throw normalizeResponseError(payload, response.status)
    }

    if (!payload?.content || typeof payload.content !== 'string') {
      throw new Error('GitHub Models proxy returned an empty response.')
    }

    await recordUsageForActiveUser(prompt, payload.content)

    emitAIDebug({
      id: callId,
      phase: 'success',
      taskType,
      model,
      cacheKey,
      durationMs: Math.round(performance.now() - startedAt),
      status: response.status,
      timestamp: new Date().toISOString(),
    })

    return payload.content
  } catch (error) {
    const status = error instanceof DailyLimitError
      ? 429
      : (error as { status?: number } | undefined)?.status

    emitAIDebug({
      id: callId,
      phase: 'error',
      taskType,
      model,
      cacheKey,
      durationMs: Math.round(performance.now() - startedAt),
      status,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    })

    throw error
  }
}
