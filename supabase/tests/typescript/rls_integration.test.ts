import { describe, expect, it, vi } from 'vitest'
import { listPriceAlerts } from '@/lib/db/alerts'
import { recordAiUsage } from '@/lib/db/ai-usage'
import { getSharedCollection, saveSharedCollection } from '@/lib/db/user'

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
        user_id: 'user-1',
        ai_tokens_used: 2048,
        ai_requests_count: 3,
        last_used_at: '2024-04-02T00:00:00.000Z',
        created_at: '2024-04-01T00:00:00.000Z',
        updated_at: '2024-04-02T00:00:00.000Z',
      }],
      error: null,
    })

    const usage = await recordAiUsage({ rpc } as never, 512, 2)

    expect(rpc).toHaveBeenCalledWith('record_ai_usage', { p_tokens: 512, p_requests: 2 })
    expect(usage.aiRequestsCount).toBe(3)
  })

  it('stores and reads public collection shares exclusively through database functions', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{
          slug: 'share-1',
          owner_user_id: 'user-1',
          owner_vault_name: 'WatchVault',
          watches_snapshot: [{ id: 'watch-1', brand: 'Rolex', model: 'Submariner', condition: 'excellent', category: 'sport' }],
          created_at: '2024-04-01T00:00:00.000Z',
          updated_at: '2024-04-01T00:00:00.000Z',
        }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{
          slug: 'share-1',
          owner_user_id: 'user-1',
          owner_vault_name: 'WatchVault',
          watches_snapshot: [{ id: 'watch-1', brand: 'Rolex', model: 'Submariner', condition: 'excellent', category: 'sport' }],
          created_at: '2024-04-01T00:00:00.000Z',
          updated_at: '2024-04-01T00:00:00.000Z',
        }],
        error: null,
      })

    const saved = await saveSharedCollection(
      { rpc } as never,
      'share-1',
      [{ id: 'watch-1', brand: 'Rolex', model: 'Submariner', condition: 'excellent', category: 'sport' }],
    )
    const shared = await getSharedCollection({ rpc } as never, 'share-1')

    expect(rpc).toHaveBeenNthCalledWith(1, 'save_collection_share', {
      p_slug: 'share-1',
      p_watches_snapshot: [{ id: 'watch-1', brand: 'Rolex', model: 'Submariner', condition: 'excellent', category: 'sport' }],
      p_expires_at: null,
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'get_shared_collection', { p_slug: 'share-1' })
    expect(saved.slug).toBe(shared?.slug)
  })
})
