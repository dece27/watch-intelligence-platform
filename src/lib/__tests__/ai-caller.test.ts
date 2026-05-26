import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DailyLimitError, callAI, createAICacheKey, getTodayCacheBucket, hashAIInput, parseAIJson } from '@/lib/ai/caller'
import { callGitHubModelsProxy } from '@/lib/github-models-proxy'

vi.mock('@/lib/github-models-proxy', () => ({
  callGitHubModelsProxy: vi.fn(),
}))

type KvStore = Map<string, unknown>

function createSparkWindow(store: KvStore, llm = vi.fn(async () => 'spark-response')) {
  return {
    dispatchEvent: vi.fn(),
    spark: {
      kv: {
        get: vi.fn(async <T,>(key: string) => store.get(key) as T | undefined),
        set: vi.fn(async <T,>(key: string, value: T) => {
          store.set(key, value)
        }),
      },
      llm,
      llmPrompt: (strings: string[], ...values: unknown[]) =>
        strings.reduce((accumulator, current, index) => accumulator + current + (values[index] ?? ''), ''),
    },
  }
}

describe('ai caller helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(callGitHubModelsProxy).mockResolvedValue('proxy-response')
    ;(globalThis as { sessionStorage?: Storage }).sessionStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 0,
    }
  })

  it('parses fenced JSON payloads', () => {
    expect(parseAIJson<{ signal: string }>('```json\n{"signal":"HOLD"}\n```')).toEqual({ signal: 'HOLD' })
  })

  it('recovers JSON objects wrapped with extra text', () => {
    expect(parseAIJson<{ signal: string }>('AI result: {"signal":"BUY_MORE"} thanks')).toEqual({ signal: 'BUY_MORE' })
  })

  it('recovers JSON arrays wrapped with extra text', () => {
    expect(parseAIJson<Array<{ id: string }>>('Ranking output: [{"id":"deal-1"}] done')).toEqual([{ id: 'deal-1' }])
  })

  it('forwards cache settings without duplicating proxy-side usage writes', async () => {
    const store: KvStore = new Map([['currentUser', { id: 'user-1' }]])
    ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

    await expect(callAI({
      prompt: 'hello',
      taskType: 'chat',
      cacheKey: 'ai:chat:user-1',
      cacheTtlSeconds: 900,
    })).resolves.toBe('proxy-response')

    expect(callGitHubModelsProxy).toHaveBeenCalledWith({
      prompt: 'hello',
      model: 'auto',
      jsonMode: false,
      taskType: 'chat',
      cacheKey: 'ai:chat:user-1',
      cacheTtlSeconds: 900,
    })
    expect(store.has('ai_usage_user-1')).toBe(false)
  })

  it('maps quota failures to DailyLimitError', async () => {
    ;(globalThis as { window?: unknown }).window = createSparkWindow(new Map())
    vi.mocked(callGitHubModelsProxy).mockRejectedValueOnce(
      Object.assign(new Error('Daily GitHub Models quota exhausted.'), {
        code: 'daily_limit_exhausted',
        status: 429,
      }),
    )

    await expect(callAI({ prompt: 'hello', taskType: 'chat' })).rejects.toBeInstanceOf(DailyLimitError)
  })

  it('falls back to Spark AI when the proxy is unavailable', async () => {
    const store: KvStore = new Map([['currentUser', { id: 'user-1' }]])
    const llm = vi.fn(async () => 'spark-response')
    ;(globalThis as { window?: unknown }).window = createSparkWindow(store, llm)
    vi.mocked(callGitHubModelsProxy).mockRejectedValueOnce(
      Object.assign(new Error('GitHub Models proxy is unavailable because Supabase browser environment variables are missing.'), {
        code: 'proxy_unavailable',
      }),
    )

    await expect(callAI({ prompt: 'hello', taskType: 'chat', jsonMode: true })).resolves.toBe('spark-response')

    expect(llm).toHaveBeenCalledWith('hello', undefined, true)
    expect(store.has('ai_usage_user-1')).toBe(true)
  })

  it('builds stable AI cache helpers', () => {
    expect(createAICacheKey('signal', 'watch-1', getTodayCacheBucket(new Date('2026-05-23T00:00:00Z')))).toBe('ai:signal:watch-1:2026-05-23')
    expect(hashAIInput('same-input')).toBe(hashAIInput('same-input'))
  })
})
