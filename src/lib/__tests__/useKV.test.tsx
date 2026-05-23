// @vitest-environment jsdom

import { act } from "react"
import { createRoot, Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useKV } from "@/lib/useKV"
import { resetSparkKVFallbackForTests } from "@/lib/sparkKV"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })
  return { promise, resolve }
}

function HookHarness() {
  const [value, setValue] = useKV<string | null>("currentUser", null)

  return (
    <div>
      <span id="value">{value ?? "null"}</span>
      <button type="button" id="login" onClick={() => setValue("session-user")}>
        Login
      </button>
    </div>
  )
}

describe("useKV", () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    resetSparkKVFallbackForTests()
    container = document.createElement("div")
    document.body.innerHTML = ""
    document.body.appendChild(container)
  })

  afterEach(async () => {
    await act(async () => {
      root?.unmount()
    })
    resetSparkKVFallbackForTests()
  })

  it("does not let an in-flight initial load overwrite a newer local value", async () => {
    const pendingGet = deferred<string | undefined>()
    const kvGet = vi.fn(async <T,>(_key: string) => pendingGet.promise as Promise<T | undefined>)
    const kvSet = vi.fn(async () => {})

    window.spark = {
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
        keys: vi.fn(async () => []),
        get: ((key: string) => kvGet(key)) as <T>(key: string) => Promise<T | undefined>,
        set: kvSet,
        delete: vi.fn(async () => {}),
      },
    }

    root = createRoot(container)
    await act(async () => {
      root.render(<HookHarness />)
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#login")!.click()
    })

    expect(container.querySelector("#value")?.textContent).toBe("session-user")

    await act(async () => {
      pendingGet.resolve(undefined)
      await Promise.resolve()
    })

    expect(container.querySelector("#value")?.textContent).toBe("session-user")
    expect(kvSet).toHaveBeenCalledTimes(1)
    expect(kvSet).toHaveBeenCalledWith("currentUser", "session-user")
  })
})
