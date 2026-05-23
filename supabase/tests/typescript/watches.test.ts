import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createWatch, getWatch, getWatches, searchWatches, softDeleteWatch, updateWatch } from '@/lib/db/watches'

const createClientMock = vi.mocked(createClient)

function buildWatchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'watch-1',
    user_id: 'user-1',
    brand: 'Rolex',
    model: 'GMT-Master II',
    reference: '126710BLRO',
    year: 2022,
    condition: 'Excellent',
    has_box: true,
    has_papers: true,
    purchase_price: 15000,
    purchase_date: '2024-01-01',
    purchase_currency: 'USD',
    serial_number: null,
    notes: 'Pepsi bezel',
    cover_photo_url: 'https://example.com/front.jpg',
    is_sold: false,
    sold_price: null,
    sold_date: null,
    deleted_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('watch data access helpers', () => {
  beforeEach(() => {
    createClientMock.mockReset()
  })

  it('lists watches with pagination and optional brand filtering', async () => {
    const range = vi.fn().mockResolvedValue({ data: [buildWatchRow()], error: null })
    const builder = {
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range,
    }
    const select = vi.fn(() => builder)
    const from = vi.fn(() => ({ select }))

    createClientMock.mockReturnValue({ from } as never)

    const result = await getWatches('user-1', { limit: 10, offset: 20, brand: 'Rolex' })

    expect(from).toHaveBeenCalledWith('watches')
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(builder.eq).toHaveBeenCalledWith('brand', 'Rolex')
    expect(builder.is).toHaveBeenCalledWith('deleted_at', null)
    expect(builder.range).toHaveBeenCalledWith(20, 29)
    expect(result).toEqual([buildWatchRow()])
  })

  it('fetches a single visible watch', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: buildWatchRow(), error: null })
    const builder = {
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      maybeSingle,
    }
    const select = vi.fn(() => builder)
    const from = vi.fn(() => ({ select }))

    createClientMock.mockReturnValue({ from } as never)

    const result = await getWatch('watch-1')

    expect(builder.eq).toHaveBeenCalledWith('id', 'watch-1')
    expect(builder.is).toHaveBeenCalledWith('deleted_at', null)
    expect(result?.reference).toBe('126710BLRO')
  })

  it('creates a watch using the inserted row payload', async () => {
    const single = vi.fn().mockResolvedValue({ data: buildWatchRow({ brand: 'Omega' }), error: null })
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ insert }))

    createClientMock.mockReturnValue({ from } as never)

    await createWatch({
      user_id: 'user-1',
      brand: 'Omega',
      model: 'Speedmaster',
      reference: '310.30.42.50.01.001',
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        brand: 'Omega',
        reference: '310.30.42.50.01.001',
      }),
    )
  })

  it('updates a non-deleted watch by id', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: buildWatchRow({ brand: 'Omega' }), error: null })
    const select = vi.fn(() => ({ maybeSingle }))
    const builder = {
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      select,
    }
    const update = vi.fn(() => builder)
    const from = vi.fn(() => ({ update }))

    createClientMock.mockReturnValue({ from } as never)

    await updateWatch('watch-1', { brand: 'Omega' })

    expect(update).toHaveBeenCalledWith({ brand: 'Omega' })
    expect(builder.eq).toHaveBeenCalledWith('id', 'watch-1')
    expect(builder.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('soft deletes a watch by timestamping deleted_at', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: buildWatchRow({ deleted_at: '2024-03-01T00:00:00.000Z' }), error: null })
    const select = vi.fn(() => ({ maybeSingle }))
    const builder = {
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      select,
    }
    const update = vi.fn(() => builder)
    const from = vi.fn(() => ({ update }))

    createClientMock.mockReturnValue({ from } as never)

    const result = await softDeleteWatch('watch-1')

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }))
    expect(result.deleted_at).toBe('2024-03-01T00:00:00.000Z')
  })

  it('searches watches with bounded pagination', async () => {
    const range = vi.fn().mockResolvedValue({ data: [buildWatchRow()], error: null })
    const builder = {
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      or: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range,
    }
    const select = vi.fn(() => builder)
    const from = vi.fn(() => ({ select }))

    createClientMock.mockReturnValue({ from } as never)

    await searchWatches('user-1', 'Pepsi, bezel')

    expect(builder.or).toHaveBeenCalledWith(
      expect.stringContaining('brand.ilike.%Pepsi bezel%'),
    )
    expect(builder.range).toHaveBeenCalledWith(0, 24)
  })
})
