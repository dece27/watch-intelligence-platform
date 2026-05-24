import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_EMAIL,
  callTrackedLlm,
  ensureUserIndexed,
  isAdminEmail,
  recordAiUsage,
} from '@/lib/adminAnalytics'
import { getSupabaseClient } from '@/lib/supabase/client'

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: vi.fn(),
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

describe('adminAnalytics helpers', () => {
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

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: 'tracked-answer' }), { status: 200 })))

    ;(globalThis as { sessionStorage?: Storage }).sessionStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 0,
    }
  })

  it('matches admin emails case-insensitively with whitespace', () => {
    expect(isAdminEmail(`  ${ADMIN_EMAIL.toUpperCase()}  `)).toBe(true)
    expect(isAdminEmail('user@example.com')).toBe(false)
  })

  it('indexes missing users and skips already-indexed users', async () => {
    const store: KvStore = new Map()
    const sparkWindow = createSparkWindow(store)
    ;(globalThis as { window?: unknown }).window = sparkWindow

    await ensureUserIndexed('user-1')
    expect(store.get('all_user_ids')).toEqual(['user-1'])

    await ensureUserIndexed('user-1')
    expect(store.get('all_user_ids')).toEqual(['user-1'])
    expect(sparkWindow.spark.kv.set).toHaveBeenCalledTimes(1)
  })

  it('repairs malformed all_user_ids values while indexing users', async () => {
    const store: KvStore = new Map([
      ['all_user_ids', { stale: true }],
    ])
    ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

    await ensureUserIndexed('user-2')

    expect(store.get('all_user_ids')).toEqual(['user-2'])
  })

  it('records and accumulates AI usage counters', async () => {
    const store: KvStore = new Map([
      [
        'ai_usage_user-1',
        {
          userId: 'user-1',
          aiTokensUsed: 10,
          aiRequestsCount: 2,
        },
      ],
    ])
    ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

    await recordAiUsage('user-1', 'prompt text', 'response text')

    const usage = store.get('ai_usage_user-1') as {
      userId: string
      aiTokensUsed: number
      aiRequestsCount: number
      lastUsedAt: string
    }
    expect(usage.userId).toBe('user-1')
    expect(usage.aiRequestsCount).toBe(3)
    expect(usage.aiTokensUsed).toBeGreaterThan(10)
    expect(usage.lastUsedAt).toEqual(expect.any(String))
  })

  it('tracks LLM usage for persisted current user', async () => {
    const store: KvStore = new Map([['currentUser', { id: 'persisted-user' }]])
    ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

    await expect(callTrackedLlm('hello', 'gpt-model', true)).resolves.toBe('tracked-answer')

    expect(fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/github-models-proxy',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(store.has('ai_usage_persisted-user')).toBe(true)
  })

  it('tracks LLM usage from sessionStorage fallback when persisted user is missing', async () => {
    const store: KvStore = new Map()
    ;(globalThis as { window?: unknown }).window = createSparkWindow(store)
    ;(globalThis.sessionStorage.getItem as unknown as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
      key === 'currentUserSession' ? JSON.stringify({ id: 'session-user' }) : null
    )

    await callTrackedLlm('hello', 'gpt-model')

    expect(store.has('ai_usage_session-user')).toBe(true)
  })

  it('does not write usage when no user can be resolved', async () => {
    const store: KvStore = new Map()
    ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

    await callTrackedLlm('hello', 'gpt-model')

    expect(Array.from(store.keys())).not.toContain('ai_usage_')
    expect(Array.from(store.keys()).find((key) => key.startsWith('ai_usage_'))).toBeUndefined()
  })

  it('forwards the requested task type to the edge function payload', async () => {
    const store: KvStore = new Map([['currentUser', { id: 'persisted-user' }]])
    ;(globalThis as { window?: unknown }).window = createSparkWindow(store)

    await callTrackedLlm('rank these deals', 'auto', true, 'deal_ranking')

    expect(fetch).toHaveBeenLastCalledWith(
      'https://example.supabase.co/functions/v1/github-models-proxy',
      expect.objectContaining({
        body: expect.stringContaining('"taskType":"deal_ranking"'),
      }),
    )
  })
})
