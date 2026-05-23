/**
 * GitHub Models Proxy — Supabase Edge Function
 *
 * Authenticates the caller via Supabase JWT, enforces per-plan daily limits,
 * routes to the correct model by task type, and proxies the request to the
 * GitHub Models API (OpenAI-compatible endpoint).
 *
 * Request  (POST, JSON):
 *   {
 *     task_type: string;
 *     messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
 *     temperature?: number;
 *   }
 * Response (200, JSON):  { content: string }
 * Response (429, JSON):  { error: 'DAILY_LIMIT_REACHED' }
 * Response (4xx/5xx JSON): { error: string }
 *
 * Deploy:
 *   supabase secrets set GITHUB_TOKEN=<pat-with-models:read>
 *   supabase functions deploy github-models-proxy
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")
const GITHUB_MODELS_URL = "https://models.inference.ai.azure.com/chat/completions"

// Model routing by task — use efficient models to preserve free quota
const MODEL_MAP: Record<string, string> = {
  signal: "gpt-4o-mini",
  chat: "gpt-4o-mini",
  identify: "gpt-4o-mini",
  deal: "gpt-4o-mini",
  appraisal: "gpt-4o-mini",
  rebalancing: "gpt-4o-mini",
  news_relevance: "gpt-4o-mini",
}

const DEFAULT_MODEL = "gpt-4o-mini"

interface ProxyRequest {
  task_type: string
  messages: Array<{ role: string; content: string }>
  temperature?: number
}

interface OpenAiResponse {
  choices: Array<{ message: { content: string } }>
  usage?: { total_tokens?: number }
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin") ?? "*"

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405, origin)
  }

  if (!GITHUB_TOKEN) {
    console.error("GITHUB_TOKEN secret is not set")
    return jsonResponse({ error: "AI gateway is not configured" }, 503, origin)
  }

  // --- Authenticate the caller via Supabase JWT --------------------------
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.error("Supabase environment variables are not configured")
    return jsonResponse({ error: "Server configuration error" }, 503, origin)
  }

  const authHeader = req.headers.get("authorization") ?? ""
  const jwt = authHeader.replace(/^Bearer\s+/i, "")
  if (!jwt) {
    return jsonResponse({ error: "Missing authorization header" }, 401, origin)
  }

  // Verify the JWT and resolve the user
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin)
  }

  // --- Parse request body -------------------------------------------------
  let body: ProxyRequest
  try {
    body = (await req.json()) as ProxyRequest
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, origin)
  }

  const { task_type, messages, temperature = 0.3 } = body

  if (!task_type || !Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ error: "task_type and messages are required" }, 400, origin)
  }

  // --- Enforce daily limits via admin client --------------------------------
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Resolve the user's subscription plan from their profile
  const { data: profile } = await adminClient
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single()

  const plan = (profile?.plan as string | undefined) ?? "free"

  const { data: allowed, error: limitError } = await adminClient.rpc(
    "check_and_increment_ai_usage",
    { p_user_id: user.id, p_call_type: task_type, p_plan: plan },
  )

  if (limitError) {
    console.error("check_and_increment_ai_usage error:", limitError)
    return jsonResponse({ error: "Failed to check usage limits" }, 500, origin)
  }

  if (!allowed) {
    return jsonResponse({ error: "DAILY_LIMIT_REACHED" }, 429, origin)
  }

  // --- Proxy to GitHub Models API -----------------------------------------
  const model = MODEL_MAP[task_type] ?? DEFAULT_MODEL

  let modelsResponse: Response
  try {
    modelsResponse = await fetch(GITHUB_MODELS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, temperature }),
    })
  } catch (err) {
    console.error("Fetch to GitHub Models failed:", err)
    return jsonResponse({ error: "Upstream fetch failed" }, 502, origin)
  }

  if (!modelsResponse.ok) {
    const errorText = await modelsResponse.text().catch(() => "")
    console.error("GitHub Models API error:", modelsResponse.status, errorText)
    return jsonResponse(
      { error: `Upstream error ${modelsResponse.status}` },
      502,
      origin,
    )
  }

  const data = (await modelsResponse.json()) as OpenAiResponse
  const content = data.choices[0]?.message?.content ?? ""

  return jsonResponse({ content }, 200, origin)
})
