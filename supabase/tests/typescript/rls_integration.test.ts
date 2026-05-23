import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: vi.fn(),
}))

import { getSupabaseClient } from '@/lib/supabase/client'
import { upsertPriceAlert, listPriceAlerts } from '@/lib/db/alerts'
import { saveDeal } from '@/lib/db/deals'
import { upsertPortfolioSnapshot } from '@/lib/db/portfolio'
import { createShareToken, getSharedCollection } from '@/lib/db/user'
import { createWatch, getWatches } from '@/lib/db/watches'
import { buildHarnessWatch, createSupabaseTestHarness } from './testSupabaseHarness'

const createClientMock = vi.mocked(getSupabaseClient)

describe('RLS-oriented integration helpers', () => {
  beforeEach(() => {
    createClientMock.mockReset()
  })

  it('covers the sign up to create watch, snapshot, saved deal, and alert flow', async () => {
    const harness = createSupabaseTestHarness()
    const watchClients = harness.createWatchesClientFactory('user-a')
    const userClient = harness.createAuthenticatedClient('user-a')
    createClientMock.mockImplementation(() => watchClients.createClient() as never)

    const watch = await createWatch({
      user_id: 'user-a',
      brand: 'Rolex',
      model: 'Explorer',
      reference: '224270',
    })

    const snapshot = await upsertPortfolioSnapshot(userClient as never, {
      userId: 'user-a',
      snapshotDate: '2024-03-01',
      totalCostBasis: 8000,
      totalMarketValue: 9200,
      watchCount: 1,
      brandBreakdown: { Rolex: 1 },
    })

    const savedDeal = await saveDeal(userClient as never, 'user-a', 'deal-1', { reference: '224270' })
    const alert = await upsertPriceAlert(userClient as never, {
      userId: 'user-a',
      brand: 'Rolex',
      reference: '224270',
      direction: 'above',
      targetPrice: 9500,
      isActive: true,
    })

    expect(watch.reference).toBe('224270')
    expect(snapshot.watchCount).toBe(1)
    expect(savedDeal.userId).toBe('user-a')
    expect(alert.userId).toBe('user-a')
  })

  it('keeps user A and user B fully isolated', async () => {
    const harness = createSupabaseTestHarness({
      watches: [
        buildHarnessWatch({ id: 'watch-a', user_id: 'user-a', reference: 'A-REF' }),
        buildHarnessWatch({ id: 'watch-b', user_id: 'user-b', reference: 'B-REF' }),
      ],
    })
    const watchClients = harness.createWatchesClientFactory('user-a')
    createClientMock.mockImplementation(() => watchClients.createClient() as never)

    const userAClient = harness.createAuthenticatedClient('user-a')
    const userBClient = harness.createAuthenticatedClient('user-b')

    await upsertPriceAlert(userAClient as never, {
      userId: 'user-a',
      brand: 'Rolex',
      reference: 'A-REF',
      direction: 'above',
      targetPrice: 10000,
      isActive: true,
    })

    await upsertPriceAlert(userBClient as never, {
      userId: 'user-b',
      brand: 'Omega',
      reference: 'B-REF',
      direction: 'below',
      targetPrice: 5000,
      isActive: true,
    })

    watchClients.setActiveUser('user-a')
    const userAWatches = await getWatches('user-a', { limit: 10, offset: 0 })
    const userAAlerts = await listPriceAlerts(userAClient as never, 'user-a')

    watchClients.setActiveUser('user-b')
    const userBWatches = await getWatches('user-a', { limit: 10, offset: 0 })
    const userBAlerts = await listPriceAlerts(userBClient as never, 'user-b')

    expect(userAWatches.map((row) => row.reference)).toEqual(['A-REF'])
    expect(userAAlerts).toHaveLength(1)
    expect(userBWatches).toEqual([])
    expect(userBAlerts).toHaveLength(1)
  })

  it('allows the admin client to read all seeded data', async () => {
    const harness = createSupabaseTestHarness({
      watches: [
        buildHarnessWatch({ id: 'watch-a', user_id: 'user-a', reference: 'A-REF' }),
        buildHarnessWatch({ id: 'watch-b', user_id: 'user-b', reference: 'B-REF' }),
      ],
    })
    const adminClient = harness.createAdminClient()

    const { data: watches } = await adminClient.from('watches').select('*')

    expect(watches.map((row) => row.reference)).toEqual(['A-REF', 'B-REF'])
  })

  it('supports the share token flow and increments view_count on access', async () => {
    const harness = createSupabaseTestHarness({
      watches: [buildHarnessWatch({ id: 'watch-share', user_id: 'user-a', reference: 'SHARE-REF', purchase_price: 15000 })],
    })
    const userClient = harness.createAuthenticatedClient('user-a')

    const token = await createShareToken(userClient as never, { hidePrices: true })
    const firstView = await getSharedCollection(userClient as never, token.token)
    const secondView = await getSharedCollection(userClient as never, token.token)

    expect(firstView?.watches).toHaveLength(1)
    expect(secondView?.viewCount).toBe(2)
    expect(secondView?.watches[0]).not.toHaveProperty('purchasePrice')
  })
})
