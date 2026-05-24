/**
 * chrono24-proxy
 * ~~~~~~~~~~~~~~
 * Supabase Edge Function that forwards Chrono24 search requests to the
 * configured Python chrono24-api wrapper server.
 *
 * The wrapper server URL is read from the CHRONO24_WRAPPER_BASE_URL secret
 * so that it never has to be baked into the frontend bundle at build time.
 *
 * When CHRONO24_WRAPPER_BASE_URL is not set the function returns an empty
 * listings payload and the frontend falls back to static demo deals.
 *
 * Expected Supabase secret:
 *   CHRONO24_WRAPPER_BASE_URL=https://your-chrono24-api-server.example.com
 */

const CHRONO24_WRAPPER_BASE_URL = Deno.env.get('CHRONO24_WRAPPER_BASE_URL')?.trim() || ''
const REQUEST_TIMEOUT_MS = 14_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only GET is needed – the chrono24-client.ts requestEndpoint function issues GETs.
  if (req.method !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed.' })
  }

  const requestUrl = new URL(req.url)
  const brand = requestUrl.searchParams.get('brand') || ''
  const model = requestUrl.searchParams.get('model') || ''
  const query = requestUrl.searchParams.get('query') || ''
  const limit = requestUrl.searchParams.get('limit') || '24'
  const maxPrice = requestUrl.searchParams.get('max_price') || ''
  const page = requestUrl.searchParams.get('page') || '1'

  // When no Python wrapper is configured return an empty-but-valid payload so
  // the frontend can silently fall back to static deals without a hard error.
  if (!CHRONO24_WRAPPER_BASE_URL) {
    return jsonResponse(200, { listings: [], total: 0 })
  }

  const base = CHRONO24_WRAPPER_BASE_URL.replace(/\/$/, '')
  const targetUrl = new URL(`${base}/search`)
  if (brand) targetUrl.searchParams.set('brand', brand)
  if (model) targetUrl.searchParams.set('model', model)
  if (query) targetUrl.searchParams.set('query', query)
  targetUrl.searchParams.set('limit', limit)
  if (maxPrice) targetUrl.searchParams.set('max_price', maxPrice)
  targetUrl.searchParams.set('page', page)

  try {
    const response = await fetch(targetUrl.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    const text = await response.text()
    return new Response(text, {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse(502, { listings: [], total: 0, error: message })
  }
})
