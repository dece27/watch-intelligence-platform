import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callGitHubModelsProxy } from '@/lib/github-models-proxy'

const invoke = vi.fn()
const getSupabaseClient = vi.fn(() => ({
  functions: {
    invoke,
  },
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient,
  hasSupabaseBrowserEnv: vi.fn(() => true),
}))

describe('github models proxy client', () => {
  beforeEach(() => {
    invoke.mockReset()
    getSupabaseClient.mockClear()
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
