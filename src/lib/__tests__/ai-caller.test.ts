import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DailyLimitError, callAI, createAICacheKey, getTodayCacheBucket, hashAIInput, parseAIJson } from '@/lib/ai/caller'
import { callGitHubModelsProxy } from '@/lib/github-models-proxy'

vi.mock('@/lib/github-models-proxy', () => ({
  callGitHubModelsProxy: vi.fn(),
}))

type KvStore = Map<string, unknown>

function createSparkWindow(store: KvStore) {
  return {
    spark: {
      kv: {
        get: vi.fn(async <T,>(key: string) => store.get(key) as T | undefined),
        set: vi.fn(async <T,>(key: string, value: T) => {
          store.set(key, value)
        }),
      },
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

  it('forwards cache settings and records usage for the active user', async () => {
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
    expect(store.has('ai_usage_user-1')).toBe(true)
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

  it('builds stable AI cache helpers', () => {
    expect(createAICacheKey('signal', 'watch-1', getTodayCacheBucket(new Date('2026-05-23T00:00:00Z')))).toBe('ai:signal:watch-1:2026-05-23')
    expect(hashAIInput('same-input')).toBe(hashAIInput('same-input'))
  })
})
