import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callGitHubModelsProxy } from '@/lib/github-models-proxy'

const { invoke, getSupabaseClient, hasSupabaseBrowserEnv } = vi.hoisted(() => {
  const invoke = vi.fn()
  const getSupabaseClient = vi.fn(() => ({
    functions: {
      invoke,
    },
  }))

  return {
    invoke,
    getSupabaseClient,
    hasSupabaseBrowserEnv: vi.fn(() => true),
  }
})

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient,
  hasSupabaseBrowserEnv,
}))

describe('github models proxy client', () => {
  beforeEach(() => {
    invoke.mockReset()
    getSupabaseClient.mockClear()
    hasSupabaseBrowserEnv.mockReturnValue(true)
  })

  it('surfaces structured edge function errors', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: new Response(
          JSON.stringify({
            error: 'Daily GitHub Models quota exhausted.',
            errorCode: 'daily_limit_exhausted',
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      }),
    })

    await expect(callGitHubModelsProxy({ prompt: 'hello', taskType: 'chat' })).rejects.toMatchObject({
      message: 'Daily GitHub Models quota exhausted.',
      code: 'daily_limit_exhausted',
      status: 429,
    })
  })
})
