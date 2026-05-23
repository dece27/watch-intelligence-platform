import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createWatch, getWatch, getWatches, searchWatches, softDeleteWatch, updateWatch } from '@/lib/db/watches'
import { buildHarnessWatch, createSupabaseTestHarness } from './testSupabaseHarness'

const createClientMock = vi.mocked(createClient)

describe('watch data access helpers', () => {
  beforeEach(() => {
    createClientMock.mockReset()
  })

  it('returns an empty collection when the active user has no watches', async () => {
    const harness = createSupabaseTestHarness()
    const watchClients = harness.createWatchesClientFactory('user-a')
    createClientMock.mockImplementation(() => watchClients.createClient() as never)

    await expect(getWatches('user-a', { limit: 5, offset: 0 })).resolves.toEqual([])
  })

  it('supports happy path CRUD and search flows', async () => {
    const harness = createSupabaseTestHarness()
    const watchClients = harness.createWatchesClientFactory('user-a')
    createClientMock.mockImplementation(() => watchClients.createClient() as never)

    const created = await createWatch({
      user_id: 'user-a',
      brand: 'Omega',
      model: 'Speedmaster',
      reference: '310.30.42.50.01.001',
      notes: 'Moonwatch',
    })

    expect(created.user_id).toBe('user-a')
    expect(created.brand).toBe('Omega')

    const fetched = await getWatch(created.id)
    expect(fetched?.reference).toBe('310.30.42.50.01.001')

    const updated = await updateWatch(created.id, { notes: 'Updated note', brand: 'Omega' })
    expect(updated.notes).toBe('Updated note')

    const searchResults = await searchWatches('user-a', 'updated note')
    expect(searchResults.map((row) => row.id)).toContain(created.id)
  })

  it('paginates the first five watches for offset zero', async () => {
    const harness = createSupabaseTestHarness({
      watches: Array.from({ length: 10 }, (_, index) => buildHarnessWatch({
        id: `watch-${index + 1}`,
        user_id: 'user-a',
        reference: `REF-${index + 1}`,
        updated_at: new Date(Date.UTC(2024, 0, 10 - index)).toISOString(),
      })),
    })
    const watchClients = harness.createWatchesClientFactory('user-a')
    createClientMock.mockImplementation(() => watchClients.createClient() as never)

    const firstPage = await getWatches('user-a', { limit: 5, offset: 0 })

    expect(firstPage).toHaveLength(5)
    expect(firstPage.map((row) => row.reference)).toEqual(['REF-1', 'REF-2', 'REF-3', 'REF-4', 'REF-5'])
  })

  it('paginates the second five watches for offset five', async () => {
    const harness = createSupabaseTestHarness({
      watches: Array.from({ length: 10 }, (_, index) => buildHarnessWatch({
        id: `watch-${index + 1}`,
        user_id: 'user-a',
        reference: `REF-${index + 1}`,
        updated_at: new Date(Date.UTC(2024, 0, 10 - index)).toISOString(),
      })),
    })
    const watchClients = harness.createWatchesClientFactory('user-a')
    createClientMock.mockImplementation(() => watchClients.createClient() as never)

    const secondPage = await getWatches('user-a', { limit: 5, offset: 5 })

    expect(secondPage).toHaveLength(5)
    expect(secondPage.map((row) => row.reference)).toEqual(['REF-6', 'REF-7', 'REF-8', 'REF-9', 'REF-10'])
  })

  it('makes a soft-deleted watch invisible to subsequent collection reads', async () => {
    const harness = createSupabaseTestHarness({
      watches: [buildHarnessWatch({ id: 'watch-soft-delete', user_id: 'user-a', reference: 'SOFT-1' })],
    })
    const watchClients = harness.createWatchesClientFactory('user-a')
    createClientMock.mockImplementation(() => watchClients.createClient() as never)

    await softDeleteWatch('watch-soft-delete')

    await expect(getWatches('user-a', { limit: 10, offset: 0 })).resolves.toEqual([])
    await expect(getWatch('watch-soft-delete')).resolves.toBeNull()
  })

  it('enforces cross-user isolation for list and get operations', async () => {
    const harness = createSupabaseTestHarness({
      watches: [
        buildHarnessWatch({ id: 'watch-a', user_id: 'user-a', reference: 'A-REF' }),
        buildHarnessWatch({ id: 'watch-b', user_id: 'user-b', reference: 'B-REF' }),
      ],
    })
    const watchClients = harness.createWatchesClientFactory('user-b')
    createClientMock.mockImplementation(() => watchClients.createClient() as never)

    const watches = await getWatches('user-a', { limit: 10, offset: 0 })
    const hiddenWatch = await getWatch('watch-a')

    expect(watches).toEqual([])
    expect(hiddenWatch).toBeNull()
  })
})
