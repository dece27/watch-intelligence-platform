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