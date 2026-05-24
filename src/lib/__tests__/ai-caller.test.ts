import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DailyLimitError, callAI, createAICacheKey, getTodayCacheBucket, hashAIInput, parseAIJson } from '@/lib/ai/caller'
import { getSupabaseClient } from '@/lib/supabase/client'

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: vi.fn(),
}))

type KvStore = Map<string, unknown>

function createSparkWindow(store: KvStore) {
  return {
    dispatchEvent: vi.fn(),
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
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'

    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: 'session-token' } },
          error: null,
        })),
      },
    } as unknown as ReturnType<typeof getSupabaseClient>)

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: 'proxy-response' }), { status: 200 })))

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

  it('calls the edge function with session bearer token and records usage for the active user', async () => {
    const store: KvStore = new Map([['currentUser', { id: 'user-1' }]])
    ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

    await expect(callAI({
      prompt: 'hello',
      taskType: 'chat',
      cacheKey: 'ai:chat:user-1',
      cacheTtlSeconds: 900,
    })).resolves.toBe('proxy-response')

    expect(fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/github-models-proxy',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer session-token',
        }),
      }),
    )
    expect(store.has('ai_usage_user-1')).toBe(true)
  })

  it('maps 429 failures to DailyLimitError', async () => {
    ;(globalThis as { window?: unknown }).window = createSparkWindow(new Map())
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Daily GitHub Models quota exhausted.', errorCode: 'daily_limit_exhausted' }), { status: 429 })))

    await expect(callAI({ prompt: 'hello', taskType: 'chat' })).rejects.toBeInstanceOf(DailyLimitError)
  })

  it('throws when no authenticated session is available', async () => {
    ;(globalThis as { window?: unknown }).window = createSparkWindow(new Map())
    vi.mocked(getSupabaseClient).mockReturnValueOnce({
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: null },
          error: null,
        })),
      },
    } as unknown as ReturnType<typeof getSupabaseClient>)

    await expect(callAI({ prompt: 'hello', taskType: 'chat' })).rejects.toThrow(
      'Authenticated Supabase session is required before calling AI features.',
    )
  })

  it('builds stable AI cache helpers', () => {
    expect(createAICacheKey('signal', 'watch-1', getTodayCacheBucket(new Date('2026-05-23T00:00:00Z')))).toBe('ai:signal:watch-1:2026-05-23')
    expect(hashAIInput('same-input')).toBe(hashAIInput('same-input'))
  })
})
