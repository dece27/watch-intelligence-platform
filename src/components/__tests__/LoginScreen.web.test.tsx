// @vitest-environment jsdom

import { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LoginScreen } from "@/components/LoginScreen"
import {
  resetSparkKVFallbackForTests,
  installSparkKVFallback,
  SPARK_KV_FALLBACK_DB_NAME,
  SPARK_KV_FALLBACK_PREFIX,
} from "@/lib/sparkKV"
import type { User } from "@/lib/types"

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function createIndexedDbMock() {
  const databases = new Map<string, Map<string, Map<string, string>>>()

  const createRequest = <T,>(executor: () => T) => {
    const request = {
      result: undefined as T | undefined,
      onsuccess: null as ((event: Event) => void) | null,
      onerror: null as ((event: Event) => void) | null,
    }

    queueMicrotask(() => {
      try {
        request.result = executor()
        request.onsuccess?.(new Event("success"))
      } catch {
        request.onerror?.(new Event("error"))
      }
    })

    return request as unknown as IDBRequest<T>
  }

  class FakeObjectStore {
    constructor(private readonly records: Map<string, string>) {}

    get(key: IDBValidKey) {
      return createRequest(() => this.records.get(String(key)))
    }

    put(value: unknown, key: IDBValidKey) {
      return createRequest(() => {
        this.records.set(String(key), String(value))
        return key
      })
    }

    delete(key: IDBValidKey) {
      return createRequest(() => {
        this.records.delete(String(key))
        return undefined
      })
    }

    getAllKeys() {
      return createRequest(() => Array.from(this.records.keys()))
    }
  }

  class FakeTransaction {
    onabort: ((event: Event) => void) | null = null

    constructor(private readonly stores: Map<string, Map<string, string>>) {}

    objectStore(name: string) {
      if (!this.stores.has(name)) {
        this.stores.set(name, new Map())
      }
      return new FakeObjectStore(this.stores.get(name)!)
    }
  }

  class FakeDatabase {
    readonly objectStoreNames = {
      contains: (name: string) => this.stores.has(name),
    }

    constructor(private readonly stores: Map<string, Map<string, string>>) {}

    createObjectStore(name: string) {
      if (!this.stores.has(name)) {
        this.stores.set(name, new Map())
      }
      return new FakeObjectStore(this.stores.get(name)!)
    }

    transaction(_storeName: string, _mode: IDBTransactionMode) {
      return new FakeTransaction(this.stores) as unknown as IDBTransaction
    }
  }

  return {
    factory: {
      open: (name: string) => {
        const request = {
          result: undefined as IDBDatabase | undefined,
          onsuccess: null as ((event: Event) => void) | null,
          onerror: null as ((event: Event) => void) | null,
          onupgradeneeded: null as ((event: Event) => void) | null,
        }

        queueMicrotask(() => {
          const databaseStores = databases.get(name) ?? new Map<string, Map<string, string>>()
          const isNewDatabase = !databases.has(name)
          databases.set(name, databaseStores)

          request.result = new FakeDatabase(databaseStores) as unknown as IDBDatabase

          if (isNewDatabase) {
            request.onupgradeneeded?.(new Event("upgradeneeded"))
          }
          request.onsuccess?.(new Event("success"))
        })

        return request as unknown as IDBOpenDBRequest
      },
    } as IDBFactory,
    read(dbName: string, storeName: string, key: string) {
      return databases.get(dbName)?.get(storeName)?.get(key) ?? null
    },
  }
}

function createRejectingSpark() {
  const forbidden = async () => {
    throw new Error("Forbidden")
  }

  return {
    llmPrompt: (strings: string[], ...values: unknown[]) =>
      strings.reduce((result, segment, index) => result + segment + String(values[index] ?? ""), ""),
    llm: vi.fn(async () => ""),
    user: vi.fn(async () => ({
      avatarUrl: "",
      email: "",
      id: 1,
      isOwner: false,
      login: "",
    })),
    kv: {
      keys: vi.fn(forbidden),
      get: vi.fn(forbidden),
      set: vi.fn(forbidden),
      delete: vi.fn(forbidden),
    },
  }
}

async function waitFor(assertion: () => void | Promise<void>, timeoutMs = 5000) {
  const startedAt = Date.now()
  let lastError: unknown

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await act(async () => {
        await Promise.resolve()
      })
      await assertion()
      return
    } catch (error) {
      lastError = error
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
    }
  }

  throw lastError
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
  })
}

function setInputValue(element: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  valueSetter?.call(element, value)
  element.dispatchEvent(new Event("input", { bubbles: true }))
  element.dispatchEvent(new Event("change", { bubbles: true }))
}

describe("LoginScreen browser fallback", () => {
  let root: Root
  let container: HTMLDivElement
  let indexedDbMock: ReturnType<typeof createIndexedDbMock>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    ;(globalThis as unknown as { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock
    indexedDbMock = createIndexedDbMock()
    ;(window as Window & { indexedDB: IDBFactory }).indexedDB = indexedDbMock.factory
    resetSparkKVFallbackForTests()
    window.sessionStorage.clear()
    window.spark = createRejectingSpark()
    installSparkKVFallback()

    container = document.createElement("div")
    document.body.innerHTML = ""
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    resetSparkKVFallbackForTests()
    window.sessionStorage.clear()
  })

  it("stores the administrator account in browser storage and logs in with the default credentials", async () => {
    const onLogin = vi.fn(async (_user: User, _rememberMe: boolean) => {})

    await act(async () => {
      root.render(<LoginScreen onLogin={onLogin} />)
    })

    await waitFor(() => {
      expect(
        indexedDbMock.read(
          SPARK_KV_FALLBACK_DB_NAME,
          "kv",
          `${SPARK_KV_FALLBACK_PREFIX}user_email_administrator`
        )
      ).not.toBeNull()
    })

    const emailInput = container.querySelector<HTMLInputElement>("#email")
    const passwordInput = container.querySelector<HTMLInputElement>("#password")
    const form = container.querySelector("form")

    expect(emailInput).not.toBeNull()
    expect(passwordInput).not.toBeNull()
    expect(form).not.toBeNull()

    await act(async () => {
      setInputValue(emailInput!, "administrator")
    })
    await flushReact()

    await waitFor(() => {
      expect(container.textContent).toContain("Unlock Vault")
    }, 10000)

    await act(async () => {
      setInputValue(passwordInput!, "WatchVault")
    })
    await flushReact()

    await act(async () => {
      form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledTimes(1)
    })

    const [user, rememberMe] = onLogin.mock.calls[0] as [User, boolean]
    expect(user.email).toBe("administrator")
    expect(rememberMe).toBe(true)

    const storedUserId = JSON.parse(
      indexedDbMock.read(
        SPARK_KV_FALLBACK_DB_NAME,
        "kv",
        `${SPARK_KV_FALLBACK_PREFIX}user_email_administrator`
      ) || "null"
    ) as string | null

    expect(storedUserId).toBeTruthy()
    expect(
      indexedDbMock.read(
        SPARK_KV_FALLBACK_DB_NAME,
        "kv",
        `${SPARK_KV_FALLBACK_PREFIX}user_${storedUserId}`
      )
    ).not.toBeNull()
    await expect(window.spark.kv.get(`auth_${storedUserId}`)).resolves.toBeTruthy()
  }, 15000)

  it("creates a brand-new user and stores the account in fallback browser storage", async () => {
    const onLogin = vi.fn(async (_user: User, _rememberMe: boolean) => {})

    await act(async () => {
      root.render(<LoginScreen onLogin={onLogin} />)
    })

    const emailInput = container.querySelector<HTMLInputElement>("#email")
    const nameInput = container.querySelector<HTMLInputElement>("#name")
    const vaultNameInput = container.querySelector<HTMLInputElement>("#vaultName")
    const passwordInput = container.querySelector<HTMLInputElement>("#password")
    const confirmPasswordInput = container.querySelector<HTMLInputElement>("#confirmPassword")
    const form = container.querySelector("form")

    expect(emailInput).not.toBeNull()
    expect(nameInput).not.toBeNull()
    expect(vaultNameInput).not.toBeNull()
    expect(passwordInput).not.toBeNull()
    expect(confirmPasswordInput).not.toBeNull()
    expect(form).not.toBeNull()

    await act(async () => {
      setInputValue(emailInput!, "new.user@example.com")
      setInputValue(nameInput!, "New User")
      setInputValue(vaultNameInput!, "New Vault")
      setInputValue(passwordInput!, "SuperSecure42")
      setInputValue(confirmPasswordInput!, "SuperSecure42")
    })
    await flushReact()

    await act(async () => {
      form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledTimes(1)
    }, 10000)

    const [user, rememberMe] = onLogin.mock.calls[0] as [User, boolean]
    expect(user.email).toBe("new.user@example.com")
    expect(user.name).toBe("New User")
    expect(user.vaultName).toBe("New Vault")
    expect(rememberMe).toBe(true)

    const storedUserId = JSON.parse(
      indexedDbMock.read(
        SPARK_KV_FALLBACK_DB_NAME,
        "kv",
        `${SPARK_KV_FALLBACK_PREFIX}user_email_new.user@example.com`
      ) || "null"
    ) as string | null

    expect(storedUserId).toBe(user.id)
    expect(
      indexedDbMock.read(
        SPARK_KV_FALLBACK_DB_NAME,
        "kv",
        `${SPARK_KV_FALLBACK_PREFIX}user_${storedUserId}`
      )
    ).not.toBeNull()
    await expect(window.spark.kv.get(`auth_${storedUserId}`)).resolves.toBeTruthy()
  }, 15000)
})
