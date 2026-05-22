function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl || baseUrl === "/") {
    return "/"
  }

  const trimmed = baseUrl.replace(/^\/+|\/+$/g, "")
  return trimmed ? `/${trimmed}/` : "/"
}

function getRelativeSegments(pathname: string, baseUrl: string): string[] {
  const pathnameSegments = pathname.split("/").filter(Boolean)
  const baseSegments = normalizeBaseUrl(baseUrl).split("/").filter(Boolean)
  const matchesBasePath = baseSegments.every((segment, index) => pathnameSegments[index] === segment)

  return (matchesBasePath ? pathnameSegments.slice(baseSegments.length) : pathnameSegments)
}

export function getSharedSlugFromLocation(pathname: string, hash = "", baseUrl = "/"): string | null {
  const pathSegments = getRelativeSegments(pathname, baseUrl)
  if (pathSegments[0] === "shared" && pathSegments[1]) {
    return decodeURIComponent(pathSegments[1])
  }

  const hashSegments = hash.replace(/^#/, "").split("/").filter(Boolean)
  if (hashSegments[0] === "shared" && hashSegments[1]) {
    return decodeURIComponent(hashSegments[1])
  }

  return null
}

export function buildSharedCollectionUrl(origin: string, slug: string, baseUrl = "/"): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const encodedSlug = encodeURIComponent(slug)

  if (normalizedBaseUrl === "/") {
    return `${origin}/shared/${encodedSlug}`
  }

  return `${origin}${normalizedBaseUrl}#shared/${encodedSlug}`
}

export function getSharedCollectionPrefix(origin: string, baseUrl = "/"): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

  if (normalizedBaseUrl === "/") {
    return `${origin}/shared/`
  }

  return `${origin}${normalizedBaseUrl}#shared/`
}
