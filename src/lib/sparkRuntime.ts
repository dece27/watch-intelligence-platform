export interface SparkRuntimeContext {
  self: unknown
  parent: unknown
  search: string
}

export function shouldLoadSparkRuntime(context: SparkRuntimeContext): boolean {
  if (context.parent !== context.self) {
    return true
  }

  const params = new URLSearchParams(context.search)
  return params.get("spark-runtime") === "1"
}

export async function loadSparkRuntimeIfNeeded(context?: SparkRuntimeContext): Promise<boolean> {
  if (typeof window === "undefined") {
    return false
  }

  const runtimeContext = context ?? {
    self: window,
    parent: window.parent,
    search: window.location.search,
  }

  if (!shouldLoadSparkRuntime(runtimeContext)) {
    return false
  }

  await import("@github/spark/spark")
  return true
}
