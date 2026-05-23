/**
 * AI client — structured multi-turn interface.
 *
 * Routes requests through the `github-models-proxy` Supabase Edge Function,
 * which verifies the user's JWT, enforces daily per-plan limits, and proxies
 * to the GitHub Models API.
 *
 * Configure by adding these to your Vite environment:
 *   VITE_SUPABASE_URL      — your Supabase project URL
 *   VITE_SUPABASE_ANON_KEY — your Supabase anon (public) key
 */

import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export type AITaskType =
  | 'signal'
  | 'chat'
  | 'identify'
  | 'deal'
  | 'appraisal'
  | 'rebalancing'
  | 'news_relevance'

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Calls the `github-models-proxy` Supabase Edge Function to generate a completion.
 *
 * @param taskType - Identifies the AI task; used for model routing and daily usage tracking.
 * @param messages - Full conversation history in OpenAI multi-turn format.
 * @param options  - Optional overrides (e.g. temperature).
 * @returns The assistant content string.
 * @throws `Error('DAILY_LIMIT_REACHED')` when the user has exhausted their daily quota.
 */
export async function callAI(
  taskType: AITaskType,
  messages: AIMessage[],
  options?: { temperature?: number },
): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error(
      'AI features require Supabase configuration. ' +
        'Set VITE_SUPABASE_URL in your environment.',
    )
  }

  const supabase = createSupabaseBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('Not authenticated')
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/github-models-proxy`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task_type: taskType,
        messages,
        temperature: options?.temperature ?? 0.3,
      }),
    },
  )

  if (response.status === 429) {
    throw new Error('DAILY_LIMIT_REACHED')
  }
  if (!response.ok) {
    throw new Error(`AI call failed: ${response.status}`)
  }

  const { content } = (await response.json()) as { content: string }
  return content
}
