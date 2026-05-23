/**
 * AI client for GitHub Pages deployments.
 *
 * When the app runs outside the Spark runtime (e.g. on GitHub Pages), the
 * `window.spark.llm` stub is unavailable.  This module calls the Supabase
 * `ai-gateway` Edge Function instead, which proxies to the GitHub Models API
 * using a server-side GITHUB_TOKEN secret.
 *
 * Configure by adding these to your Vite environment (e.g. GitHub Actions
 * repository variables):
 *   VITE_SUPABASE_URL       — your Supabase project URL
 *   VITE_SUPABASE_ANON_KEY  — your Supabase anon (public) key
 */

interface AiGatewayResponse {
  text?: string
  error?: string
}

/**
 * Calls the `ai-gateway` Supabase Edge Function to generate a completion.
 *
 * Signature is intentionally compatible with `window.spark.llm` so it can
 * be used as a drop-in fallback.
 */
export async function callGitHubModelsAI(
  prompt: string,
  model = "gpt-4o-mini",
  jsonMode = false,
): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "AI features require Supabase configuration. " +
        "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.",
    )
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/ai-gateway`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ prompt, model, jsonMode }),
  })

  if (!response.ok) {
    throw new Error(`AI gateway returned HTTP ${response.status}`)
  }

  const data = (await response.json()) as AiGatewayResponse

  if (data.error) {
    throw new Error(`AI gateway error: ${data.error}`)
  }

  return data.text ?? ""
}
