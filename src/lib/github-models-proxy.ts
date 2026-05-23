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
}

export async function callGitHubModelsProxy({
  prompt,
  model,
  jsonMode,
  taskType = 'general',
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
      },
    },
  )

  if (error) {
    throw new Error(`GitHub Models proxy request failed: ${error.message}`, { cause: error })
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  if (!data?.content || typeof data.content !== 'string') {
    throw new Error('GitHub Models proxy returned an empty response.')
  }

  return data.content
}
