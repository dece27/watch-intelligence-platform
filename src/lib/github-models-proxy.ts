import { getSupabaseClient } from '@/lib/supabase/client'

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

export async function callGitHubModelsProxy({
  prompt,
  model,
  jsonMode,
  taskType = 'general',
  cacheKey,
  cacheTtlSeconds,
}: GitHubModelsProxyRequest): Promise<string> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke<GitHubModelsProxyResponse>(
    'github-models-proxy',
    {
      body: {
        prompt,
        model,
        jsonMode,
        taskType,
        cacheKey,
        cacheTtlSeconds,
      },
    },
  )

  if (error) {
    const wrappedError = new Error(`GitHub Models proxy request failed: ${error.message}`)
    ;(wrappedError as Error & { cause?: unknown }).cause = error
    throw wrappedError
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
