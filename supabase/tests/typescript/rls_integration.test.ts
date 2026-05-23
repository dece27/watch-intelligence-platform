import { describe, expect, it, vi } from 'vitest'
import { listPriceAlerts } from '@/lib/db/alerts'
import { recordAiUsage } from '@/lib/db/ai-usage'
import { createShareToken, getSharedCollection } from '@/lib/db/user'

describe('RLS-oriented integration helpers', () => {
  it('keeps alert queries scoped to the active user id', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))

    await listPriceAlerts({ from } as never, 'user-1')

    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('records AI usage through the secured rpc entry point', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        id: 'usage-1',
        user_id: 'user-1',
        usage_date: '2024-04-02',
        call_type: 'signal',
        call_count: 3,
        tokens_used: 2048,
        created_at: '2024-04-02T00:00:00.000Z',
      }],
      error: null,
    })

    const usage = await recordAiUsage({ rpc } as never, 'signal', 512, '2024-04-02', 2)

    expect(rpc).toHaveBeenCalledWith('record_ai_usage', {
      p_call_type: 'signal',
      p_tokens: 512,
      p_usage_date: '2024-04-02',
      p_increment: 2,
    })
    expect(usage.callCount).toBe(3)
  })

  it('creates and resolves share tokens through database rpc functions', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{
          id: 'share-1',
          user_id: 'user-1',
          token: 'token-123',
          access: 'read_only',
          hide_prices: true,
          view_count: 0,
          last_viewed: null,
          expires_at: null,
          created_at: '2024-04-01T00:00:00.000Z',
        }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{
          token: 'token-123',
          user_id: 'user-1',
          access: 'read_only',
          hide_prices: true,
          display_name: 'WatchVault',
          view_count: 1,
          last_viewed: '2024-04-01T00:00:00.000Z',
          expires_at: null,
          watches: [{ id: 'watch-1', brand: 'Rolex', reference: '126610LN' }],
        }],
        error: null,
      })

    const token = await createShareToken({ rpc } as never)
    const shared = await getSharedCollection({ rpc } as never, 'token-123')

    expect(rpc).toHaveBeenNthCalledWith(1, 'create_share_token', {
      p_hide_prices: true,
      p_expires_at: null,
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'get_shared_collection', { p_token: 'token-123' })
    expect(token.token).toBe(shared?.token)
  })
})
