import { getSupabaseClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client'

export type GitHubModelsTaskType =
  | 'general'
  | 'chat'
  | 'signal'
  | 'identify'
  | 'deal_assessment'
  | 'deal_ranking'
  | 'rebalancing'
  | 'what_if'

interface GitHubModelsProxyRequest {
  prompt: string
  model?: string
  jsonMode?: boolean
  taskType?: GitHubModelsTaskType
  imageInput?: string
  cacheKey?: string
  cacheTtlSeconds?: number
}

interface GitHubModelsProxyResponse {
  content?: string
  model?: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  error?: string
  errorCode?: string
}

type ProxyInvokeError = Error & {
  code?: string
  status?: number
  context?: Response
}

async function normalizeInvokeError(error: ProxyInvokeError): Promise<Error & { code?: string; status?: number; cause?: unknown }> {
  let message = error.message
  let code = error.code
  let status = error.status

  if (error.context instanceof Response) {
    status = error.context.status || status
    try {
      const payload = await error.context.clone().json() as GitHubModelsProxyResponse
      if (typeof payload.error === 'string' && payload.error.trim()) {
        message = payload.error
      }
      if (typeof payload.errorCode === 'string' && payload.errorCode.trim()) {
        code = payload.errorCode
      }
    } catch {
      try {
        const text = await error.context.clone().text()
        if (text.trim()) {
          message = text.trim()
        }
      } catch {
        // Keep the original message when the error response cannot be parsed.
      }
    }
  }

  return Object.assign(new Error(message), {
    cause: error,
    code,
    status: code === 'daily_limit_exhausted' ? 429 : status,
  })
}

export async function callGitHubModelsProxy({
  prompt,
  model,
  jsonMode,
  taskType = 'general',
  imageInput,
  cacheKey,
  cacheTtlSeconds,
}: GitHubModelsProxyRequest): Promise<string> {
  if (!hasSupabaseBrowserEnv()) {
    throw Object.assign(
      new Error('GitHub Models proxy is unavailable because Supabase browser environment variables are missing.'),
      { code: 'proxy_unavailable' },
    )
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke<GitHubModelsProxyResponse>(
    'github-models-proxy',
    {
      body: {
        prompt,
        model,
        jsonMode,
        taskType,
        ...(imageInput ? { imageInput } : {}),
        cacheKey,
        cacheTtlSeconds,
      },
    },
  )

  if (error) {
    throw await normalizeInvokeError(error as ProxyInvokeError)
  }

  if (data?.error) {
    const proxyError = Object.assign(new Error(data.error), {
      code: data.errorCode,
      status: data.errorCode === 'daily_limit_exhausted' ? 429 : undefined,
    })
    throw proxyError
  }

  if (!data?.content || typeof data.content !== 'string') {
    throw new Error('GitHub Models proxy returned an empty response.')
  }

  return data.content
}
