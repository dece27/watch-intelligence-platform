/**
 * AI Gateway — Supabase Edge Function
 *
 * Accepts a prompt from the browser and forwards it to the GitHub Models API
 * (OpenAI-compatible endpoint).  The GITHUB_TOKEN secret is kept server-side
 * and never exposed to the client.
 *
 * Request  (POST, JSON):  { prompt: string; callType?: string; model?: string; jsonMode?: boolean; userId?: string }
 * Response (200,  JSON):  { text: string }
 * Response (4xx/5xx JSON): { error: string }
 *
 * Deploy:
 *   supabase secrets set GITHUB_TOKEN=<pat-with-models:read>
 *   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
 *   supabase functions deploy ai-gateway
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")
const GITHUB_MODELS_URL = "https://models.inference.ai.azure.com/chat/completions"

// Model routing by task — use efficient models to preserve free quota
const MODEL_MAP: Record<string, string> = {
  "appraisal": "gpt-4o-mini",
  "advisor": "gpt-4o-mini",
  "deal-ranking": "gpt-4o-mini",
  "what-if": "gpt-4o-mini",
  "market": "gpt-4o-mini",
  "portfolio": "gpt-4o-mini",
}

const DEFAULT_MODEL = "gpt-4o-mini"

interface AiGatewayRequest {
  prompt: string
  callType?: string
  model?: string
  jsonMode?: boolean
  userId?: string
}

interface OpenAiResponse {
  choices: Array<{ message: { content: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
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
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  })
}

function resolveModel(callType?: string, model?: string): string {
  if (callType && MODEL_MAP[callType]) {
    return MODEL_MAP[callType]
  }
  return model ?? DEFAULT_MODEL
}

async function tryRecordUsage(
  userId: string,
  callType: string,
  tokens: number,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    return
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    await admin
      .from("ai_usage_logs")
      .upsert(
        {
          user_id: userId,
          usage_date: new Date().toISOString().slice(0, 10),
          call_type: callType,
          call_count: 1,
          tokens_used: tokens,
        },
        { onConflict: "user_id,usage_date,call_type", ignoreDuplicates: false },
      )
  } catch (err) {
    console.error("Failed to record AI usage:", err)
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin") ?? "*"

  // Handle CORS preflight
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

  let body: AiGatewayRequest
  try {
    body = (await req.json()) as AiGatewayRequest
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, origin)
  }

  const { prompt, callType, model, jsonMode = false, userId } = body

  if (!prompt || typeof prompt !== "string") {
    return jsonResponse({ error: "prompt is required" }, 400, origin)
  }

  const resolvedModel = resolveModel(callType, model)

  const requestBody: Record<string, unknown> = {
    model: resolvedModel,
    messages: [{ role: "user", content: prompt }],
  }
  if (jsonMode) {
    requestBody["response_format"] = { type: "json_object" }
  }

  let modelsResponse: Response
  try {
    modelsResponse = await fetch(GITHUB_MODELS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
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
  const text = data.choices[0]?.message?.content ?? ""

  // Best-effort usage recording — never blocks the response
  if (userId && callType) {
    const tokens = data.usage?.total_tokens ?? 0
    tryRecordUsage(userId, callType, tokens).catch(() => undefined)
  }

  return jsonResponse({ text }, 200, origin)
})
