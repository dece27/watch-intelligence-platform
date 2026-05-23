const SPARK_KV_FALLBACK_PREFIX = "spark_kv_fallback:"
const SPARK_KV_FALLBACK_DB_NAME = "watchvault-spark-kv"
const SPARK_KV_FALLBACK_STORE_NAME = "kv"
const FALLBACK_USER = {
  avatarUrl: "",
  email: "",
  id: "",
  isOwner: false,
  login: "",
}

type SparkKvClient = Window["spark"]["kv"]

const memoryFallback = new Map<string, string>()

let sparkKvFallbackInstalled = false
let shouldUseBrowserStorage = false
let fallbackDbPromise: Promise<IDBDatabase | null> | null = null

function canUseIndexedDb(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined"
}

function getFallbackStorageKey(key: string): string {
  return `${SPARK_KV_FALLBACK_PREFIX}${key}`
}

function openFallbackDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) {
    return Promise.resolve(null)
  }

  if (!fallbackDbPromise) {
    fallbackDbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(SPARK_KV_FALLBACK_DB_NAME, 1)

        request.onupgradeneeded = () => {
          const database = request.result
          if (!database.objectStoreNames.contains(SPARK_KV_FALLBACK_STORE_NAME)) {
            database.createObjectStore(SPARK_KV_FALLBACK_STORE_NAME)
          }
        }

        request.onsuccess = () => {
          resolve(request.result)
        }

        request.onerror = () => {
          resolve(null)
        }
      } catch {
        resolve(null)
      }
    })
  }

  return fallbackDbPromise
}

async function readIndexedDbValue(key: string): Promise<string | null> {
  const database = await openFallbackDb()
  if (!database) {
    return null
  }

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(SPARK_KV_FALLBACK_STORE_NAME, "readonly")
      const request = transaction.objectStore(SPARK_KV_FALLBACK_STORE_NAME).get(getFallbackStorageKey(key))

      request.onsuccess = () => {
        resolve(typeof request.result === "string" ? request.result : null)
      }
      request.onerror = () => {
        resolve(null)
      }
      transaction.onabort = () => {
        resolve(null)
      }
    } catch {
      resolve(null)
    }
  })
}

async function writeIndexedDbValue(key: string, value: string): Promise<boolean> {
  const database = await openFallbackDb()
  if (!database) {
    return false
  }

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(SPARK_KV_FALLBACK_STORE_NAME, "readwrite")
      const request = transaction.objectStore(SPARK_KV_FALLBACK_STORE_NAME).put(value, getFallbackStorageKey(key))

      request.onsuccess = () => {
        resolve(true)
      }
      request.onerror = () => {
        resolve(false)
      }
      transaction.onabort = () => {
        resolve(false)
      }
    } catch {
      resolve(false)
    }
  })
}

async function deleteIndexedDbValue(key: string): Promise<boolean> {
  const database = await openFallbackDb()
  if (!database) {
    return false
  }

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(SPARK_KV_FALLBACK_STORE_NAME, "readwrite")
      const request = transaction.objectStore(SPARK_KV_FALLBACK_STORE_NAME).delete(getFallbackStorageKey(key))

      request.onsuccess = () => {
        resolve(true)
      }
      request.onerror = () => {
        resolve(false)
      }
      transaction.onabort = () => {
        resolve(false)
      }
    } catch {
      resolve(false)
    }
  })
}

async function readIndexedDbKeys(): Promise<string[]> {
  const database = await openFallbackDb()
  if (!database) {
    return []
  }

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(SPARK_KV_FALLBACK_STORE_NAME, "readonly")
      const request = transaction.objectStore(SPARK_KV_FALLBACK_STORE_NAME).getAllKeys()

      request.onsuccess = () => {
        const keys = Array.isArray(request.result)
          ? request.result
              .filter((key): key is string => typeof key === "string" && key.startsWith(SPARK_KV_FALLBACK_PREFIX))
              .map((key) => key.slice(SPARK_KV_FALLBACK_PREFIX.length))
          : []
        resolve(keys)
      }
      request.onerror = () => {
        resolve([])
      }
      transaction.onabort = () => {
        resolve([])
      }
    } catch {
      resolve([])
    }
  })
}

async function getFallbackKeys(): Promise<string[]> {
  const persistedKeys = await readIndexedDbKeys()
  const inMemoryKeys = Array.from(memoryFallback.keys()).map((key) => key.slice(SPARK_KV_FALLBACK_PREFIX.length))
  return Array.from(new Set([...persistedKeys, ...inMemoryKeys]))
}

async function getFallbackValue<T>(key: string): Promise<T | undefined> {
  const storageKey = getFallbackStorageKey(key)
  const raw = await readIndexedDbValue(key) ?? memoryFallback.get(storageKey) ?? null
  if (raw === null) {
    return undefined
  }

  return JSON.parse(raw) as T
}

async function setFallbackValue<T>(key: string, value: T): Promise<void> {
  const storageKey = getFallbackStorageKey(key)

  if (value === undefined) {
    const deletedFromIndexedDb = await deleteIndexedDbValue(key)
    if (!deletedFromIndexedDb) {
      memoryFallback.delete(storageKey)
    }
    return
  }

  const serializedValue = JSON.stringify(value)
  const persisted = await writeIndexedDbValue(key, serializedValue)
  if (persisted) {
    memoryFallback.delete(storageKey)
    return
  }

  memoryFallback.set(storageKey, serializedValue)
}

async function deleteFallbackValue(key: string): Promise<void> {
  const deletedFromIndexedDb = await deleteIndexedDbValue(key)
  if (!deletedFromIndexedDb) {
    memoryFallback.delete(getFallbackStorageKey(key))
  }
}

function joinPrompt(strings: string[], values: unknown[]): string {
  let result = ""
  for (let index = 0; index < strings.length; index += 1) {
    result += strings[index]
    if (index < values.length) {
      result += String(values[index] ?? "")
    }
  }
  return result
}

export function installSparkKVFallback() {
  if (sparkKvFallbackInstalled || typeof window === "undefined") {
    return
  }

  const originalSpark = window.spark
  const originalKv = originalSpark?.kv
  shouldUseBrowserStorage = !originalKv

  const kv: SparkKvClient = {
    keys: async () => {
      if (!shouldUseBrowserStorage && originalKv) {
        try {
          return await originalKv.keys()
        } catch {
          shouldUseBrowserStorage = true
        }
      }

      return getFallbackKeys()
    },
    get: async <T,>(key: string) => {
      if (!shouldUseBrowserStorage && originalKv) {
        try {
          return await originalKv.get<T>(key)
        } catch {
          shouldUseBrowserStorage = true
        }
      }

      return getFallbackValue<T>(key)
    },
    set: async <T,>(key: string, value: T) => {
      if (!shouldUseBrowserStorage && originalKv) {
        try {
          await originalKv.set(key, value)
          return
        } catch {
          shouldUseBrowserStorage = true
        }
      }

      await setFallbackValue(key, value)
    },
    delete: async (key: string) => {
      if (!shouldUseBrowserStorage && originalKv) {
        try {
          await originalKv.delete(key)
          return
        } catch {
          shouldUseBrowserStorage = true
        }
      }

      await deleteFallbackValue(key)
    },
  }

  window.spark = {
    llmPrompt: originalSpark?.llmPrompt ?? ((strings, ...values) => joinPrompt(strings, values)),
    llm: originalSpark?.llm ?? (async () => {
      throw new Error("Spark AI features are unavailable in this deployment.")
    }),
    user: originalSpark?.user ?? (async () => FALLBACK_USER),
    kv,
  }

  sparkKvFallbackInstalled = true
}

export function resetSparkKVFallbackForTests() {
  sparkKvFallbackInstalled = false
  shouldUseBrowserStorage = false
  fallbackDbPromise = null
  memoryFallback.clear()
}

export { SPARK_KV_FALLBACK_DB_NAME, SPARK_KV_FALLBACK_PREFIX }
