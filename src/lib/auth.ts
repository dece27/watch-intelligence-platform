const AUTH_ALGORITHM = "PBKDF2"
const HASH_ALGORITHM = "SHA-256"
const ITERATIONS = 210_000
const KEY_LENGTH = 256
const SALT_LENGTH = 16

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function deriveHash(passphrase: string, salt: Uint8Array, iterations = ITERATIONS): Promise<string> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    AUTH_ALGORITHM,
    false,
    ["deriveBits"]
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: AUTH_ALGORITHM,
      salt,
      iterations,
      hash: HASH_ALGORITHM,
    },
    keyMaterial,
    KEY_LENGTH
  )

  return bytesToBase64(new Uint8Array(derivedBits))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export interface PasswordHashPayload {
  passwordHash: string
  salt: string
  iterations: number
}

export async function hashPassword(passphrase: string): Promise<PasswordHashPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const passwordHash = await deriveHash(passphrase, salt, ITERATIONS)

  return {
    passwordHash,
    salt: bytesToBase64(salt),
    iterations: ITERATIONS,
  }
}

export async function verifyPassword(passphrase: string, payload: PasswordHashPayload): Promise<boolean> {
  const saltBytes = base64ToBytes(payload.salt)
  const hash = await deriveHash(passphrase, saltBytes, payload.iterations)
  return timingSafeEqual(hash, payload.passwordHash)
}
