const SPARK_KV_FALLBACK_PREFIX = "spark_kv_fallback:"
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

function canUseLocalStorage(): boolean {
  try {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
      return false
    }
    const testKey = `${SPARK_KV_FALLBACK_PREFIX}availability`
    window.localStorage.setItem(testKey, "1")
    window.localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

function getFallbackItem(key: string): string | null {
  const storageKey = `${SPARK_KV_FALLBACK_PREFIX}${key}`
  if (canUseLocalStorage()) {
    return window.localStorage.getItem(storageKey)
  }
  return memoryFallback.get(storageKey) ?? null
}

function setFallbackItem(key: string, value: string) {
  const storageKey = `${SPARK_KV_FALLBACK_PREFIX}${key}`
  if (canUseLocalStorage()) {
    window.localStorage.setItem(storageKey, value)
    return
  }
  memoryFallback.set(storageKey, value)
}

function deleteFallbackItem(key: string) {
  const storageKey = `${SPARK_KV_FALLBACK_PREFIX}${key}`
  if (canUseLocalStorage()) {
    window.localStorage.removeItem(storageKey)
    return
  }
  memoryFallback.delete(storageKey)
}

async function getFallbackKeys(): Promise<string[]> {
  if (canUseLocalStorage()) {
    return Object.keys(window.localStorage)
      .filter((key) => key.startsWith(SPARK_KV_FALLBACK_PREFIX))
      .map((key) => key.slice(SPARK_KV_FALLBACK_PREFIX.length))
  }

  return Array.from(memoryFallback.keys()).map((key) => key.slice(SPARK_KV_FALLBACK_PREFIX.length))
}

async function getFallbackValue<T>(key: string): Promise<T | undefined> {
  const raw = getFallbackItem(key)
  if (raw === null) {
    return undefined
  }

  return JSON.parse(raw) as T
}

async function setFallbackValue<T>(key: string, value: T): Promise<void> {
  if (value === undefined) {
    deleteFallbackItem(key)
    return
  }

  setFallbackItem(key, JSON.stringify(value))
}

async function deleteFallbackValue(key: string): Promise<void> {
  deleteFallbackItem(key)
}

function joinPrompt(strings: TemplateStringsArray, values: unknown[]): string {
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
  memoryFallback.clear()
}

export { SPARK_KV_FALLBACK_PREFIX }
