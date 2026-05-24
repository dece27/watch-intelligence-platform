import { useEffect, useMemo, useState } from 'react'

type DebugEventPhase = 'start' | 'success' | 'error'

interface AIDebugEventDetail {
  id: string
  phase: DebugEventPhase
  taskType: string
  model: string
  cacheKey?: string
  durationMs?: number
  status?: number
  error?: string
  timestamp: string
}

interface DebugCallRecord {
  id: string
  taskType: string
  model: string
  cacheKey?: string
  startedAt: string
  finishedAt?: string
  status: 'pending' | 'success' | 'error'
  durationMs?: number
  httpStatus?: number
  error?: string
}

const DEBUG_EVENT_NAME = 'ai-call-debug'
const MAX_EVENTS = 20

export function AIDebugOverlay() {
  const [records, setRecords] = useState<DebugCallRecord[]>([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const handleDebugEvent = (event: Event) => {
      const detail = (event as CustomEvent<AIDebugEventDetail>).detail
      if (!detail?.id || !detail?.phase) return

      setRecords((current) => {
        const next = [...current]
        const existingIndex = next.findIndex((entry) => entry.id === detail.id)

        if (detail.phase === 'start') {
          const created: DebugCallRecord = {
            id: detail.id,
            taskType: detail.taskType,
            model: detail.model,
            cacheKey: detail.cacheKey,
            startedAt: detail.timestamp,
            status: 'pending',
          }

          if (existingIndex >= 0) {
            next[existingIndex] = created
          } else {
            next.unshift(created)
          }
        } else if (existingIndex >= 0) {
          const existing = next[existingIndex]
          next[existingIndex] = {
            ...existing,
            status: detail.phase === 'success' ? 'success' : 'error',
            finishedAt: detail.timestamp,
            durationMs: detail.durationMs,
            httpStatus: detail.status,
            error: detail.error,
          }
        }

        return next.slice(0, MAX_EVENTS)
      })
    }

    window.addEventListener(DEBUG_EVENT_NAME, handleDebugEvent)
    return () => window.removeEventListener(DEBUG_EVENT_NAME, handleDebugEvent)
  }, [])

  const summary = useMemo(() => {
    const pending = records.filter((entry) => entry.status === 'pending').length
    const errors = records.filter((entry) => entry.status === 'error').length
    return { pending, errors, total: records.length }
  }, [records])

  return (
    <div className="fixed bottom-4 right-4 z-[200] w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border border-amber-500/40 bg-black/85 text-amber-100 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-amber-500/30 px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className="text-left text-xs font-semibold tracking-wide uppercase"
        >
          AI Debug Overlay ({summary.total})
        </button>
        <div className="text-[11px] text-amber-200/90">
          {summary.pending} pending · {summary.errors} errors
        </div>
      </div>

      {!collapsed && (
        <div className="max-h-72 overflow-y-auto px-3 py-2 text-[11px]">
          {records.length === 0 ? (
            <div className="text-amber-100/70">No AI calls yet.</div>
          ) : (
            <div className="space-y-2">
              {records.map((record) => (
                <div key={record.id} className="rounded border border-amber-500/20 bg-black/40 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{record.taskType}</span>
                    <span
                      className={record.status === 'error'
                        ? 'text-red-300'
                        : record.status === 'success'
                          ? 'text-emerald-300'
                          : 'text-amber-200'}
                    >
                      {record.status}
                    </span>
                  </div>
                  <div className="text-amber-100/80">model: {record.model}</div>
                  {record.cacheKey && <div className="truncate text-amber-100/70">cache: {record.cacheKey}</div>}
                  <div className="text-amber-100/70">
                    {record.durationMs !== undefined ? `${record.durationMs} ms` : 'running'}
                    {record.httpStatus ? ` · HTTP ${record.httpStatus}` : ''}
                  </div>
                  {record.error && <div className="mt-1 text-red-200">{record.error}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
