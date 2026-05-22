import { describe, it, expect, vi } from 'vitest'
import {
  getWatchPhotoKey,
  toWatchPhotoRef,
  isWatchPhotoRef,
  sanitizeWatchImageUrl,
  prepareWatchForStorage,
  WATCH_PHOTO_REF_PREFIX,
  MAX_DATA_IMAGE_URL_LENGTH,
} from '../watchPhotoUtils'
import type { Watch } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWatch(id: string, imageUrl?: string): Watch {
  return {
    id,
    brand: 'Test',
    model: 'Watch',
    purchasePrice: 1000,
    purchaseDate: '2024-01-01',
    condition: 'excellent',
    category: 'dress',
    imageUrl,
  }
}

// ---------------------------------------------------------------------------
// getWatchPhotoKey
// ---------------------------------------------------------------------------

describe('getWatchPhotoKey', () => {
  it('formats the KV key as watch_photo_<userId>_<watchId>', () => {
    expect(getWatchPhotoKey('user-1', 'watch-42')).toBe('watch_photo_user-1_watch-42')
  })
})

// ---------------------------------------------------------------------------
// toWatchPhotoRef
// ---------------------------------------------------------------------------

describe('toWatchPhotoRef', () => {
  it('formats the photo reference as kv-photo:<watchId>', () => {
    expect(toWatchPhotoRef('watch-42')).toBe('kv-photo:watch-42')
  })
})

// ---------------------------------------------------------------------------
// isWatchPhotoRef
// ---------------------------------------------------------------------------

describe('isWatchPhotoRef', () => {
  it('returns true for a kv-photo: reference', () => {
    expect(isWatchPhotoRef(`${WATCH_PHOTO_REF_PREFIX}watch-1`)).toBe(true)
  })

  it('returns false for a data URL', () => {
    expect(isWatchPhotoRef('data:image/jpeg;base64,abc=')).toBe(false)
  })

  it('returns false for an HTTPS URL', () => {
    expect(isWatchPhotoRef('https://example.com/photo.jpg')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isWatchPhotoRef(undefined)).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(isWatchPhotoRef('')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// sanitizeWatchImageUrl
// ---------------------------------------------------------------------------

describe('sanitizeWatchImageUrl', () => {
  it('returns undefined for undefined input', () => {
    expect(sanitizeWatchImageUrl(undefined)).toBeUndefined()
  })

  it('returns undefined for an empty string', () => {
    expect(sanitizeWatchImageUrl('')).toBeUndefined()
  })

  it('returns undefined for a whitespace-only string', () => {
    expect(sanitizeWatchImageUrl('   ')).toBeUndefined()
  })

  it('accepts a valid JPEG base64 data URL', () => {
    const url = 'data:image/jpeg;base64,/9j/abc123='
    expect(sanitizeWatchImageUrl(url)).toBe(url)
  })

  it('accepts valid PNG, WebP, and GIF data URLs', () => {
    expect(sanitizeWatchImageUrl('data:image/png;base64,abc=')).toBe('data:image/png;base64,abc=')
    expect(sanitizeWatchImageUrl('data:image/webp;base64,abc=')).toBe('data:image/webp;base64,abc=')
    expect(sanitizeWatchImageUrl('data:image/gif;base64,abc=')).toBe('data:image/gif;base64,abc=')
  })

  it('rejects data URLs with disallowed MIME types', () => {
    expect(sanitizeWatchImageUrl('data:text/html;base64,abc=')).toBeUndefined()
    expect(sanitizeWatchImageUrl('data:application/json;base64,abc=')).toBeUndefined()
    expect(sanitizeWatchImageUrl('data:image/svg+xml;base64,abc=')).toBeUndefined()
  })

  it('rejects data URLs that are too large', () => {
    // Construct a string that exceeds the limit by 1 character
    const oversized = 'data:image/jpeg;base64,' + 'A'.repeat(MAX_DATA_IMAGE_URL_LENGTH)
    expect(sanitizeWatchImageUrl(oversized)).toBeUndefined()
  })

  it('accepts a valid HTTPS URL', () => {
    const url = 'https://example.com/photo.jpg'
    expect(sanitizeWatchImageUrl(url)).toBe(url)
  })

  it('rejects an HTTP URL', () => {
    expect(sanitizeWatchImageUrl('http://example.com/photo.jpg')).toBeUndefined()
  })

  it('rejects kv-photo: references (not sanitizable as image URLs)', () => {
    expect(sanitizeWatchImageUrl('kv-photo:watch-123')).toBeUndefined()
  })

  it('rejects completely invalid strings', () => {
    expect(sanitizeWatchImageUrl('not a url at all')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// prepareWatchForStorage — core behaviour
// ---------------------------------------------------------------------------

describe('prepareWatchForStorage', () => {
  it('saves a new data-URL photo to KV and returns a kv-photo ref for storage', async () => {
    const kvSet = vi.fn().mockResolvedValue(undefined)
    const dataUrl = 'data:image/jpeg;base64,/9j/new='
    const watch = makeWatch('watch-2', dataUrl)

    const result = await prepareWatchForStorage(watch, 'user-1', kvSet, undefined)

    expect(result.watchForStorage.imageUrl).toBe('kv-photo:watch-2')
    expect(result.watchForDisplay.imageUrl).toBe(dataUrl)
    expect(kvSet).toHaveBeenCalledOnce()
    expect(kvSet).toHaveBeenCalledWith('watch_photo_user-1_watch-2', dataUrl)
  })

  it('passes a valid HTTPS URL through unchanged without a KV write', async () => {
    const kvSet = vi.fn().mockResolvedValue(undefined)
    const url = 'https://cdn.example.com/watch.jpg'
    const watch = makeWatch('watch-3', url)

    const result = await prepareWatchForStorage(watch, 'user-1', kvSet, undefined)

    expect(result.watchForStorage.imageUrl).toBe(url)
    expect(result.watchForDisplay.imageUrl).toBe(url)
    expect(kvSet).not.toHaveBeenCalled()
  })

  it('clears an undefined imageUrl without a KV write', async () => {
    const kvSet = vi.fn().mockResolvedValue(undefined)
    const watch = makeWatch('watch-4', undefined)

    const result = await prepareWatchForStorage(watch, 'user-1', kvSet, undefined)

    expect(result.watchForStorage.imageUrl).toBeUndefined()
    expect(result.watchForDisplay.imageUrl).toBeUndefined()
    expect(kvSet).not.toHaveBeenCalled()
  })

  it('clears an invalid imageUrl without a KV write', async () => {
    const kvSet = vi.fn().mockResolvedValue(undefined)
    const watch = makeWatch('watch-5', 'http://insecure.example.com/photo.jpg')

    const result = await prepareWatchForStorage(watch, 'user-1', kvSet, undefined)

    expect(result.watchForStorage.imageUrl).toBeUndefined()
    expect(result.watchForDisplay.imageUrl).toBeUndefined()
    expect(kvSet).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// prepareWatchForStorage — bug regression
//
// Root cause: sanitizeWatchImageUrl("kv-photo:watch-X") returns undefined
// because kv-photo: is neither a data: URL nor an HTTPS URL. Without the
// isWatchPhotoRef guard, handleUpdateWatches would overwrite every existing
// watch's imageUrl with undefined whenever any watch was saved, effectively
// deleting all previously uploaded photos from the vault.
// ---------------------------------------------------------------------------

describe('prepareWatchForStorage — kv-photo reference preservation (bug regression)', () => {
  it('preserves a kv-photo ref in storage when the watch already has a stored photo', async () => {
    const kvSet = vi.fn().mockResolvedValue(undefined)
    // This is exactly how a watch looks when loaded fresh from KV after its
    // photo was previously uploaded and saved.
    const watch = makeWatch('watch-1', 'kv-photo:watch-1')
    const existingDisplayUrl = 'data:image/jpeg;base64,/9j/existing='

    const result = await prepareWatchForStorage(watch, 'user-1', kvSet, existingDisplayUrl)

    // Storage must keep the kv-photo ref — NOT become undefined.
    expect(result.watchForStorage.imageUrl).toBe('kv-photo:watch-1')
    // Display should use the already-hydrated data URL from React state.
    expect(result.watchForDisplay.imageUrl).toBe(existingDisplayUrl)
    // The photo is already in KV — no duplicate write should occur.
    expect(kvSet).not.toHaveBeenCalled()
  })

  it('kv-photo ref is NOT wiped (the specific pre-fix regression)', async () => {
    // Before the fix, sanitizeWatchImageUrl("kv-photo:watch-X") returned undefined,
    // so this assertion would have failed: imageUrl would be undefined.
    const kvSet = vi.fn().mockResolvedValue(undefined)
    const watch = makeWatch('watch-existing', 'kv-photo:watch-existing')

    const result = await prepareWatchForStorage(watch, 'user-1', kvSet, undefined)

    expect(result.watchForStorage.imageUrl).not.toBeUndefined()
    expect(result.watchForStorage.imageUrl).toBe('kv-photo:watch-existing')
  })

  it('falls back gracefully when no existing display URL is provided', async () => {
    const kvSet = vi.fn().mockResolvedValue(undefined)
    const watch = makeWatch('watch-7', 'kv-photo:watch-7')

    const result = await prepareWatchForStorage(watch, 'user-1', kvSet, undefined)

    // Storage ref must be preserved.
    expect(result.watchForStorage.imageUrl).toBe('kv-photo:watch-7')
    // Display will be undefined until the next load hydrates it — acceptable.
    expect(result.watchForDisplay.imageUrl).toBeUndefined()
    expect(kvSet).not.toHaveBeenCalled()
  })

  it('does not touch KV when only metadata (not the photo) is updated on an existing watch', async () => {
    // Simulates editing a watch's brand/model without changing the photo.
    const kvSet = vi.fn().mockResolvedValue(undefined)
    const watch = { ...makeWatch('watch-8', 'kv-photo:watch-8'), brand: 'Omega', model: 'Updated' }

    const result = await prepareWatchForStorage(watch, 'user-1', kvSet, 'data:image/jpeg;base64,/9j/photo=')

    expect(result.watchForStorage.imageUrl).toBe('kv-photo:watch-8')
    expect(result.watchForStorage.brand).toBe('Omega')
    expect(result.watchForStorage.model).toBe('Updated')
    expect(kvSet).not.toHaveBeenCalled()
  })
})
