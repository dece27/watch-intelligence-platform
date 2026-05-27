import { Watch } from './types'

export const WATCH_PHOTO_KEY_PREFIX = "watch_photo_"
export const WATCH_PHOTO_REF_PREFIX = "kv-photo:"
export const MAX_DATA_IMAGE_URL_LENGTH = 800_000
export const MAX_REMOTE_IMAGE_URL_LENGTH = 2_048

export function getWatchPhotoKey(userId: string, watchId: string): string {
  return `${WATCH_PHOTO_KEY_PREFIX}${userId}_${watchId}`
}

export function toWatchPhotoRef(watchId: string): string {
  return `${WATCH_PHOTO_REF_PREFIX}${watchId}`
}

export function isWatchPhotoRef(imageUrl?: string): boolean {
  return Boolean(imageUrl?.startsWith(WATCH_PHOTO_REF_PREFIX))
}

export function sanitizeWatchImageUrl(imageUrl?: string): string | undefined {
  if (!imageUrl) return undefined
  const trimmed = imageUrl.trim()
  if (!trimmed) return undefined

  if (trimmed.startsWith("data:image/")) {
    const isSafeDataImage = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(trimmed)
    if (!isSafeDataImage || trimmed.length > MAX_DATA_IMAGE_URL_LENGTH) return undefined
    return trimmed
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== "https:") return undefined
    if (trimmed.length > MAX_REMOTE_IMAGE_URL_LENGTH) return undefined
    return parsed.toString()
  } catch {
    return undefined
  }
}

/**
 * Prepares a single watch for both KV storage and in-memory display.
 *
 * - Persists new `data:image/` uploads directly on the watch record so they are
 *   stored in Supabase alongside the rest of the watch metadata.
 * - Migrates legacy `kv-photo:` references to the hydrated display URL whenever
 *   that URL is available in memory.
 * - Preserves unresolved legacy `kv-photo:` references until they can be
 *   migrated, rather than wiping them.
 * - Passes valid HTTPS image URLs through unchanged and strips unsafe values.
 *
 * @param watch            - The watch object to prepare.
 * @param userId           - Retained for backward-compatible call sites.
 * @param kvSet            - Retained for backward-compatible call sites.
 * @param existingDisplayUrl - The currently hydrated image URL for this watch
 *   (from in-memory React state). Used as the display URL when the watch already
 *   has a `kv-photo:` reference so the UI continues showing the photo without
 *   an extra KV read. When `undefined` (e.g. the watch is new or not yet in
 *   state), the returned display URL will also be `undefined` and the photo
 *   will appear after the next full load that hydrates the reference.
 */
export async function prepareWatchForStorage(
  watch: Watch,
  userId: string,
  kvSet: (key: string, value: string) => Promise<void>,
  existingDisplayUrl?: string,
): Promise<{ watchForStorage: Watch; watchForDisplay: Watch }> {
  void userId
  void kvSet

  // Legacy kv-photo references can be migrated to a first-class persisted image
  // whenever the hydrated display URL is available.
  if (isWatchPhotoRef(watch.imageUrl)) {
    const migratedImageUrl = sanitizeWatchImageUrl(existingDisplayUrl)
    if (migratedImageUrl) {
      return {
        watchForStorage: { ...watch, imageUrl: migratedImageUrl },
        watchForDisplay: { ...watch, imageUrl: migratedImageUrl },
      }
    }

    return {
      watchForStorage: { ...watch },
      watchForDisplay: { ...watch, imageUrl: existingDisplayUrl },
    }
  }

  const sanitizedImageUrl = sanitizeWatchImageUrl(watch.imageUrl)

  if (!sanitizedImageUrl) {
    return {
      watchForStorage: { ...watch, imageUrl: undefined },
      watchForDisplay: { ...watch, imageUrl: undefined },
    }
  }

  return {
    watchForStorage: { ...watch, imageUrl: sanitizedImageUrl },
    watchForDisplay: { ...watch, imageUrl: sanitizedImageUrl },
  }
}
