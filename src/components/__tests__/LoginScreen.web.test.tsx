// @vitest-environment jsdom

import { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LoginScreen } from "@/components/LoginScreen"
import { resetSparkKVFallbackForTests, installSparkKVFallback, SPARK_KV_FALLBACK_PREFIX } from "@/lib/sparkKV"
import type { User } from "@/lib/types"

function createRejectingSpark() {
  const forbidden = async () => {
    throw new Error("Forbidden")
  }

  return {
    llmPrompt: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((result, segment, index) => result + segment + String(values[index] ?? ""), ""),
    llm: vi.fn(async () => ""),
    user: vi.fn(async () => ({
      avatarUrl: "",
      email: "",
      id: "",
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

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  await assertion()
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe("LoginScreen browser fallback", () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    resetSparkKVFallbackForTests()
    window.localStorage.clear()
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
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it("stores the administrator account in browser storage and logs in with the default credentials", async () => {
    const onLogin = vi.fn(async (_user: User, _rememberMe: boolean) => {})

    await act(async () => {
      root.render(<LoginScreen onLogin={onLogin} />)
    })

    await waitFor(() => {
      expect(window.localStorage.getItem(`${SPARK_KV_FALLBACK_PREFIX}user_email_administrator`)).not.toBeNull()
    })

    const emailInput = container.querySelector<HTMLInputElement>("#email")
    const passwordInput = container.querySelector<HTMLInputElement>("#password")
    const form = container.querySelector("form")

    expect(emailInput).not.toBeNull()
    expect(passwordInput).not.toBeNull()
    expect(form).not.toBeNull()

    await act(async () => {
      emailInput!.value = "administrator"
      emailInput!.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await flushReact()

    await waitFor(() => {
      expect(container.textContent).toContain("Unlock Vault")
    })

    await act(async () => {
      passwordInput!.value = "WatchVault"
      passwordInput!.dispatchEvent(new Event("input", { bubbles: true }))
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
      window.localStorage.getItem(`${SPARK_KV_FALLBACK_PREFIX}user_email_administrator`) || "null"
    ) as string | null

    expect(storedUserId).toBeTruthy()
    expect(window.localStorage.getItem(`${SPARK_KV_FALLBACK_PREFIX}user_${storedUserId}`)).not.toBeNull()
    expect(window.localStorage.getItem(`${SPARK_KV_FALLBACK_PREFIX}auth_${storedUserId}`)).not.toBeNull()
  })
})
