/// <reference types="vite/client" />
declare const GITHUB_RUNTIME_PERMANENT_NAME: string
declare const BASE_KV_SERVICE_URL: string

interface ImportMetaEnv {
	readonly VITE_WATCHCHARTS_API_KEY?: string
	readonly VITE_WATCHCHARTS_BASE_URL?: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    spark: {
      llmPrompt: (strings: TemplateStringsArray, ...values: unknown[]) => string
      llm: (prompt: string, modelName?: string, jsonMode?: boolean) => Promise<string>
      user: () => Promise<{
        avatarUrl: string
        email: string
        id: string
        isOwner: boolean
        login: string
      }>
      kv: {
        keys: () => Promise<string[]>
        get: <T>(key: string) => Promise<T | undefined>
        set: <T>(key: string, value: T) => Promise<void>
        delete: (key: string) => Promise<void>
      }
    }
  }
  
  const spark: Window['spark']
}