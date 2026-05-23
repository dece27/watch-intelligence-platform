/**
 * AI Gateway — Supabase Edge Function
 *
 * Accepts a prompt from the browser and forwards it to the GitHub Models API
 * (OpenAI-compatible endpoint).  The GITHUB_TOKEN secret is kept server-side
 * and never exposed to the client.
 *
 * Request  (POST, JSON):  { prompt: string; model?: string; jsonMode?: boolean }
 * Response (200,  JSON):  { text: string }
 * Response (4xx/5xx JSON): { error: string }
 *
 * Deploy:
 *   supabase secrets set GITHUB_TOKEN=<pat-with-models:read>
 *   supabase functions deploy ai-gateway
 */

const GITHUB_MODELS_URL = "https://models.inference.ai.azure.com/chat/completions"
const DEFAULT_MODEL = "gpt-4o-mini"

interface AiGatewayRequest {
  prompt: string
  model?: string
  jsonMode?: boolean
}

interface OpenAiResponse {
  choices: Array<{ message: { content: string } }>
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

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin") ?? "*"

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405, origin)
  }

  const githubToken = Deno.env.get("GITHUB_TOKEN")
  if (!githubToken) {
    console.error("GITHUB_TOKEN secret is not set")
    return jsonResponse({ error: "AI gateway is not configured" }, 503, origin)
  }

  let body: AiGatewayRequest
  try {
    body = (await req.json()) as AiGatewayRequest
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, origin)
  }

  const { prompt, model = DEFAULT_MODEL, jsonMode = false } = body

  if (!prompt || typeof prompt !== "string") {
    return jsonResponse({ error: "prompt is required" }, 400, origin)
  }

  const requestBody: Record<string, unknown> = {
    model,
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
        Authorization: `Bearer ${githubToken}`,
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

  return jsonResponse({ text }, 200, origin)
})
