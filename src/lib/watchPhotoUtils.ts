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
 * - Preserves existing `kv-photo:` references in storage — the photo blob is
 *   already persisted separately and must not be overwritten with `undefined`.
 * - Saves new `data:image/` photos to KV under `watch_photo_<userId>_<watchId>`
 *   and replaces `imageUrl` with a `kv-photo:<watchId>` reference for storage.
 * - Passes valid HTTPS image URLs through unchanged.
 * - Strips any unsafe, invalid, or oversized image URLs.
 *
 * @param watch            - The watch object to prepare.
 * @param userId           - The owning user's ID.
 * @param kvSet            - Async function that persists a value to KV storage.
 * @param existingDisplayUrl - The currently hydrated image URL for this watch
 *   (from in-memory React state). Used as the display URL when the watch already
 *   has a `kv-photo:` reference so the UI continues showing the photo.
 */
export async function prepareWatchForStorage(
  watch: Watch,
  userId: string,
  kvSet: (key: string, value: string) => Promise<void>,
  existingDisplayUrl?: string,
): Promise<{ watchForStorage: Watch; watchForDisplay: Watch }> {
  // Preserve existing kv-photo references — the photo is already stored in KV.
  // Without this check, sanitizeWatchImageUrl would return undefined for kv-photo:
  // URLs (they are neither data: nor HTTPS), silently wiping the photo reference.
  if (isWatchPhotoRef(watch.imageUrl)) {
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

  if (sanitizedImageUrl.startsWith("data:image/")) {
    let imageForStorage = sanitizedImageUrl
    try {
      await kvSet(getWatchPhotoKey(userId, watch.id), sanitizedImageUrl)
      imageForStorage = toWatchPhotoRef(watch.id)
    } catch (error) {
      console.error(`Error saving watch photo for ${watch.id}:`, error)
    }
    return {
      watchForStorage: { ...watch, imageUrl: imageForStorage },
      watchForDisplay: { ...watch, imageUrl: sanitizedImageUrl },
    }
  }

  return {
    watchForStorage: { ...watch, imageUrl: sanitizedImageUrl },
    watchForDisplay: { ...watch, imageUrl: sanitizedImageUrl },
  }
}
