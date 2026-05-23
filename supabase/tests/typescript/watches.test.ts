import { describe, expect, it, vi } from 'vitest'
import { listWatchPhotos, listWatches, upsertWatch } from '@/lib/db/watches'

describe('watches persistence helpers', () => {
  it('maps database rows back to watch records', async () => {
    const is = vi.fn().mockResolvedValue({
      data: [
        {
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
        },
      ],
      error: null,
    })
    const order = vi.fn(() => ({ is }))
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))

    const result = await listWatches({ from } as never, 'user-1')

    expect(from).toHaveBeenCalledWith('watches')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(result[0]).toMatchObject({
      userId: 'user-1',
      reference: '126710BLRO',
      coverPhotoUrl: 'https://example.com/front.jpg',
      hasBox: true,
    })
  })

  it('upserts watch rows with snake_case columns', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'watch-1',
        user_id: 'user-1',
        brand: 'Omega',
        model: 'Speedmaster',
        reference: '310.30.42.50.01.001',
        year: 2023,
        condition: 'Good',
        has_box: false,
        has_papers: true,
        purchase_price: 8000,
        purchase_date: '2024-02-01',
        purchase_currency: 'USD',
        serial_number: null,
        notes: null,
        cover_photo_url: null,
        is_sold: false,
        sold_price: null,
        sold_date: null,
        deleted_at: null,
        created_at: '2024-02-01T00:00:00.000Z',
        updated_at: '2024-02-01T00:00:00.000Z',
      },
      error: null,
    })
    const select = vi.fn(() => ({ single }))
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))

    await upsertWatch(
      { from } as never,
      {
        id: 'watch-1',
        userId: 'user-1',
        brand: 'Omega',
        model: 'Speedmaster',
        reference: '310.30.42.50.01.001',
        year: 2023,
        condition: 'Good',
        hasBox: false,
        hasPapers: true,
        purchasePrice: 8000,
        purchaseDate: '2024-02-01',
        purchaseCurrency: 'USD',
        isSold: false,
      },
    )

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        reference: '310.30.42.50.01.001',
        has_papers: true,
      }),
      { onConflict: 'id' },
    )
  })

  it('lists watch photos ordered by position then created_at', async () => {
    const secondOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const firstOrder = vi.fn(() => ({ order: secondOrder }))
    const eqWatch = vi.fn(() => ({ order: firstOrder }))
    const eqUser = vi.fn(() => ({ eq: eqWatch }))
    const select = vi.fn(() => ({ eq: eqUser }))
    const from = vi.fn(() => ({ select }))

    await listWatchPhotos({ from } as never, 'user-1', 'watch-9')

    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqWatch).toHaveBeenCalledWith('watch_id', 'watch-9')
    expect(firstOrder).toHaveBeenCalledWith('position', { ascending: true })
    expect(secondOrder).toHaveBeenCalledWith('created_at', { ascending: true })
  })
})
