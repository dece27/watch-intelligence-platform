import { callGitHubModelsProxy, type GitHubModelsTaskType } from '@/lib/github-models-proxy'
import { recordAiUsage, resolveCurrentUserId } from '@/lib/ai/usage'
import { installSparkKVFallback } from '@/lib/sparkKV'

const DEFAULT_CACHE_TTL_SECONDS = 60 * 60 * 6
const SESSION_CACHE_KEY_PREFIX = 'ai_cache:'

// L1: fast in-memory map, reset on page reload
const l1Cache = new Map<string, { result: string; expiresAt: number }>()

// In-flight deduplication: keyed by cacheKey, holds the pending Promise
const inflightMap = new Map<string, Promise<string>>()

function readL2Cache(cacheKey: string): string | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY_PREFIX + cacheKey)
    if (!raw) return null
    const entry = JSON.parse(raw) as { result: string; expiresAt: number }
    if (Date.now() < entry.expiresAt) {
      l1Cache.set(cacheKey, entry)
      return entry.result
    }
    sessionStorage.removeItem(SESSION_CACHE_KEY_PREFIX + cacheKey)
    return null
  } catch {
    return null
  }
}

function writeCache(cacheKey: string, result: string, ttlSeconds: number) {
  const expiresAt = Date.now() + ttlSeconds * 1000
  const entry = { result, expiresAt }
  l1Cache.set(cacheKey, entry)
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY_PREFIX + cacheKey, JSON.stringify(entry))
  } catch {
    // sessionStorage quota exceeded; L1 is still populated
  }
}

/**
 * Read a previously cached AI result from L1 (in-memory) or L2 (sessionStorage)
 * without making any network request.  Returns `null` on a cache miss or if
 * the entry has expired.
 */
export function readAICache(cacheKey: string): string | null {
  const l1 = l1Cache.get(cacheKey)
  if (l1) {
    if (Date.now() < l1.expiresAt) return l1.result
    l1Cache.delete(cacheKey)
  }
  return readL2Cache(cacheKey)
}

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
  imageInput?: string
  cacheKey?: string
  cacheTtlSeconds?: number
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

function isDailyLimitFailure(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const errorLike = error as Error & { code?: string; status?: number }
  return (
    errorLike.code === 'daily_limit_exhausted' ||
    errorLike.status === 429 ||
    /daily.*quota|daily.*limit|quota.*exhausted|rate limit|429/i.test(error.message)
  )
}

function shouldFallbackToSpark(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const errorLike = error as Error & { code?: string }
  return (
    errorLike.code === 'proxy_unavailable' ||
    /Missing Supabase environment variable/i.test(error.message) ||
    /Failed to send a request to the Edge Function/i.test(error.message) ||
    /NetworkError/i.test(error.message)
  )
}

function isSparkUnavailableError(error: unknown) {
  return error instanceof Error && /Spark AI features are unavailable in this deployment/i.test(error.message)
}

async function recordUsageForActiveUser(prompt: string, response: string) {
  const userId = await resolveCurrentUserId()
  if (userId) {
    await recordAiUsage(userId, prompt, response)
  }
}

async function callSparkAI(prompt: string, model: string, jsonMode: boolean) {
  installSparkKVFallback()
  return window.spark.llm(prompt, model === 'auto' ? undefined : model, jsonMode)
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
  imageInput,
  cacheKey,
  cacheTtlSeconds = DEFAULT_CACHE_TTL_SECONDS,
}: CallAIOptions): Promise<string> {
  // ── L1 / L2 client-side cache check ────────────────────────────────────────
  if (cacheKey) {
    const cached = readAICache(cacheKey)
    if (cached !== null) return cached

    // In-flight deduplication: reuse an already-pending request for the same key
    const inflight = inflightMap.get(cacheKey)
    if (inflight) return inflight
  }

  // ── Execute the request (possibly fallback to Spark) ───────────────────────
  const request = (async () => {
    try {
      const response = await callGitHubModelsProxy({
        prompt,
        model,
        jsonMode,
        taskType,
        ...(imageInput ? { imageInput } : {}),
        cacheKey,
        cacheTtlSeconds,
      })
      if (cacheKey) writeCache(cacheKey, response, cacheTtlSeconds)
      return response
    } catch (error) {
      if (isDailyLimitFailure(error)) {
        throw new DailyLimitError('The daily AI quota has been exhausted. Showing a fallback result instead.', error)
      }

      if (shouldFallbackToSpark(error)) {
        try {
          const response = await callSparkAI(prompt, model, jsonMode)
          await recordUsageForActiveUser(prompt, response)
          if (cacheKey) writeCache(cacheKey, response, cacheTtlSeconds)
          return response
        } catch (sparkError) {
          if (!isSparkUnavailableError(sparkError)) {
            throw sparkError
          }
        }
      }

      throw error
    }
  })()

  if (cacheKey) {
    inflightMap.set(cacheKey, request)
    void request.finally(() => { inflightMap.delete(cacheKey) })
  }

  return request
}
