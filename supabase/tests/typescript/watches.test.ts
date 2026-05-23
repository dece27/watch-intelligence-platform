import { describe, expect, it, vi } from 'vitest'
import { deleteWatch, listWatches, upsertWatch } from '@/lib/db/watches'

describe('watches persistence helpers', () => {
  it('maps database rows back to watch domain objects', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'watch-1',
          user_id: 'user-1',
          brand: 'Rolex',
          model: 'GMT-Master II',
          reference_number: '126710BLRO',
          serial_number: null,
          year: 2022,
          purchase_price: 15000,
          purchase_date: '2024-01-01',
          current_value: 18000,
          condition: 'excellent',
          category: 'sport',
          image_path: 'user-1/watch-1/front.jpg',
          movement: 'Automatic',
          case_material: 'Steel',
          case_diameter: '40mm',
          notes: 'Pepsi bezel',
          has_box: true,
          has_papers: true,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
      ],
      error: null,
    })
    const secondOrder = vi.fn(() => ({ order }))
    const eq = vi.fn(() => ({ order: secondOrder }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))

    const result = await listWatches({ from } as never, 'user-1')

    expect(from).toHaveBeenCalledWith('watches')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(result[0]).toMatchObject({
      userId: 'user-1',
      referenceNumber: '126710BLRO',
      imagePath: 'user-1/watch-1/front.jpg',
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
        reference_number: '310.30.42.50.01.001',
        serial_number: null,
        year: 2023,
        purchase_price: 8000,
        purchase_date: '2024-02-01',
        current_value: 8200,
        condition: 'good',
        category: 'chronograph',
        image_path: null,
        movement: null,
        case_material: null,
        case_diameter: null,
        notes: null,
        has_box: false,
        has_papers: true,
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
        referenceNumber: '310.30.42.50.01.001',
        year: 2023,
        purchasePrice: 8000,
        purchaseDate: '2024-02-01',
        currentValue: 8200,
        condition: 'good',
        category: 'chronograph',
        hasBox: false,
        hasPapers: true,
      },
    )

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        reference_number: '310.30.42.50.01.001',
        has_papers: true,
      }),
      { onConflict: 'id' },
    )
  })

  it('deletes only the current user watch row', async () => {
    const eqId = vi.fn().mockResolvedValue({ error: null })
    const eqUser = vi.fn(() => ({ eq: eqId }))
    const deleteFn = vi.fn(() => ({ eq: eqUser }))
    const from = vi.fn(() => ({ delete: deleteFn }))

    await deleteWatch({ from } as never, 'user-1', 'watch-9')

    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqId).toHaveBeenCalledWith('id', 'watch-9')
  })
})
