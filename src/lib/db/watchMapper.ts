import type { WatchCondition } from '@/lib/supabase/types'
import type { WatchInsert, WatchRow, WatchUpdate } from '@/lib/db/watches'
import type { Watch } from '@/lib/types'

const APP_TO_DB_CONDITION: Record<Watch['condition'], WatchCondition> = {
  mint: 'Mint',
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
}

const DB_TO_APP_CONDITION: Partial<Record<WatchCondition, Watch['condition']>> = {
  Unworn: 'mint',
  Mint: 'mint',
  Excellent: 'excellent',
  'Very Good': 'excellent',
  Good: 'good',
  Fair: 'fair',
}

/**
 * Converts an app-level Watch to a Supabase WatchInsert.
 * The `imageUrl` on the watch should already be the storage-ready value
 * (either a `kv-photo:<watchId>` reference or a valid HTTPS URL).
 */
export function watchToInsert(watch: Watch, userId: string): WatchInsert {
  return {
    id: watch.id,
    user_id: userId,
    brand: watch.brand,
    model: watch.model || null,
    reference: watch.referenceNumber ?? '',
    year: watch.year ?? null,
    condition: watch.condition ? APP_TO_DB_CONDITION[watch.condition] : null,
    has_box: watch.hasBox ?? false,
    has_papers: watch.hasPapers ?? false,
    purchase_price: watch.purchasePrice,
    purchase_date: watch.purchaseDate || null,
    serial_number: watch.serialNumber ?? null,
    notes: watch.notes ?? null,
    cover_photo_url: watch.imageUrl ?? null,
    category: watch.category ?? null,
    movement: watch.movement ?? null,
    case_material: watch.caseMaterial ?? null,
    case_diameter: watch.caseDiameter ?? null,
  }
}

/**
 * Converts an app-level Watch to a Supabase WatchUpdate.
 */
export function watchToUpdate(watch: Watch): WatchUpdate {
  return {
    brand: watch.brand,
    model: watch.model || null,
    reference: watch.referenceNumber ?? '',
    year: watch.year ?? null,
    condition: watch.condition ? APP_TO_DB_CONDITION[watch.condition] : null,
    has_box: watch.hasBox ?? false,
    has_papers: watch.hasPapers ?? false,
    purchase_price: watch.purchasePrice,
    purchase_date: watch.purchaseDate || null,
    serial_number: watch.serialNumber ?? null,
    notes: watch.notes ?? null,
    cover_photo_url: watch.imageUrl ?? null,
    category: watch.category ?? null,
    movement: watch.movement ?? null,
    case_material: watch.caseMaterial ?? null,
    case_diameter: watch.caseDiameter ?? null,
  }
}

/**
 * Converts a Supabase WatchRow to an app-level Watch.
 * Image hydration (kv-photo: references) is performed separately by the caller.
 */
export function rowToWatch(row: WatchRow): Watch {
  return {
    id: row.id,
    brand: row.brand,
    model: row.model ?? '',
    referenceNumber: row.reference || undefined,
    serialNumber: row.serial_number ?? undefined,
    year: row.year ?? undefined,
    purchasePrice: row.purchase_price ?? 0,
    purchaseDate: row.purchase_date ?? '',
    condition:
      (row.condition ? DB_TO_APP_CONDITION[row.condition] : undefined) ?? 'good',
    category: (row.category as Watch['category']) ?? 'dress',
    imageUrl: row.cover_photo_url ?? undefined,
    movement: row.movement ?? undefined,
    caseMaterial: row.case_material ?? undefined,
    caseDiameter: row.case_diameter ?? undefined,
    notes: row.notes ?? undefined,
    hasBox: row.has_box,
    hasPapers: row.has_papers,
  }
}
