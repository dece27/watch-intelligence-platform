/// <reference types="vite/client" />
declare const GITHUB_RUNTIME_PERMANENT_NAME: string
declare const BASE_KV_SERVICE_URL: string

interface ImportMetaEnv {
	readonly VITE_WATCHCHARTS_API_KEY?: string
	readonly VITE_WATCHCHARTS_BASE_URL?: string
	readonly VITE_CHRONO24_WRAPPER_BASE_URL?: string
	readonly VITE_CHRONO24_WRAPPER_API_KEY?: string
	readonly VITE_CHRONO24_WRAPPER_AUTH_HEADER?: string
	readonly VITE_CHRONO24_WRAPPER_AUTH_SCHEME?: string
	readonly VITE_CHRONO24_WRAPPER_SEARCH_ENDPOINT?: string
	readonly VITE_CHRONO24_WRAPPER_SEARCH_ENDPOINTS?: string
	readonly VITE_CHRONO24_API_BASE_URL?: string
	readonly VITE_CHRONO24_API_KEY?: string
	readonly VITE_CHRONO24_API_HOST?: string
	readonly CHRONO24_WRAPPER_BASE_URL?: string
	readonly CHRONO24_WRAPPER_API_KEY?: string
	readonly CHRONO24_WRAPPER_AUTH_HEADER?: string
	readonly CHRONO24_WRAPPER_AUTH_SCHEME?: string
	readonly CHRONO24_WRAPPER_SEARCH_ENDPOINT?: string
	readonly CHRONO24_WRAPPER_SEARCH_ENDPOINTS?: string
	readonly CHRONO24_API_BASE_URL?: string
	readonly CHRONO24_API_KEY?: string
	readonly CHRONO24_API_HOST?: string
	readonly VITE_DEFAULT_ACCOUNT_PASSWORD_HASH?: string
	readonly VITE_DEFAULT_ACCOUNT_SALT?: string
	readonly VITE_DEFAULT_ACCOUNT_ITERATIONS?: string
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