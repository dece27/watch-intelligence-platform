import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type WatchRow = Database['public']['Tables']['watches']['Row']
type WatchInsert = Database['public']['Tables']['watches']['Insert']
type PortfolioSnapshotRow = Database['public']['Tables']['portfolio_snapshots']['Row']
type PortfolioSnapshotInsert = Database['public']['Tables']['portfolio_snapshots']['Insert']
type SavedDealRow = Database['public']['Tables']['saved_deals']['Row']
type SavedDealInsert = Database['public']['Tables']['saved_deals']['Insert']
type PriceAlertRow = Database['public']['Tables']['price_alerts']['Row']
type PriceAlertInsert = Database['public']['Tables']['price_alerts']['Insert']
type ShareTokenRow = Database['public']['Tables']['share_tokens']['Row']

type SessionRole = 'authenticated' | 'anon' | 'service_role'
type TableName = 'watches' | 'portfolio_snapshots' | 'saved_deals' | 'price_alerts' | 'share_tokens'

type TableRowMap = {
  watches: WatchRow
  portfolio_snapshots: PortfolioSnapshotRow
  saved_deals: SavedDealRow
  price_alerts: PriceAlertRow
  share_tokens: ShareTokenRow
}

type Session = {
  role: SessionRole
  userId: string | null
}

type OrderSpec<T> = {
  column: keyof T
  ascending: boolean
}

type SelectBuilder<T> = {
  eq: (column: keyof T & string, value: unknown) => SelectBuilder<T>
  is: (column: keyof T & string, value: unknown) => SelectBuilder<T>
  or: (expression: string) => SelectBuilder<T>
  order: (column: keyof T & string, options?: { ascending?: boolean }) => SelectBuilder<T>
  range: (from: number, to: number) => SelectBuilder<T>
  limit: (count: number) => SelectBuilder<T>
  maybeSingle: () => Promise<{ data: T | null; error: null }>
  single: () => Promise<{ data: T; error: null }>
  then: <TResult1 = { data: T[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: T[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) {
    return 0
  }

  if (left === null || left === undefined) {
    return -1
  }

  if (right === null || right === undefined) {
    return 1
  }

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  return String(left).localeCompare(String(right))
}

function extractSearchTerm(expression: string): string | null {
  const match = /brand\.ilike\.%(.+?)%/.exec(expression)
  return match?.[1]?.toLowerCase() ?? null
}

export function buildHarnessWatch(overrides: Partial<WatchRow> = {}): WatchRow {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    user_id: overrides.user_id ?? 'user-1',
    brand: overrides.brand ?? 'Rolex',
    model: overrides.model ?? 'Submariner',
    reference: overrides.reference ?? '126610LN',
    year: overrides.year ?? 2024,
    condition: overrides.condition ?? 'Excellent',
    has_box: overrides.has_box ?? true,
    has_papers: overrides.has_papers ?? true,
    purchase_price: overrides.purchase_price ?? 10000,
    purchase_date: overrides.purchase_date ?? '2024-01-01',
    purchase_currency: overrides.purchase_currency ?? 'USD',
    serial_number: overrides.serial_number ?? null,
    notes: overrides.notes ?? null,
    cover_photo_url: overrides.cover_photo_url ?? null,
    is_sold: overrides.is_sold ?? false,
    sold_price: overrides.sold_price ?? null,
    sold_date: overrides.sold_date ?? null,
    deleted_at: overrides.deleted_at ?? null,
    created_at: overrides.created_at ?? '2024-01-01T00:00:00.000Z',
    updated_at: overrides.updated_at ?? '2024-01-01T00:00:00.000Z',
  }
}

export function createSupabaseTestHarness(initial?: {
  watches?: WatchRow[]
  portfolioSnapshots?: PortfolioSnapshotRow[]
  savedDeals?: SavedDealRow[]
  priceAlerts?: PriceAlertRow[]
  shareTokens?: ShareTokenRow[]
}) {
  const state: {
    watches: WatchRow[]
    portfolio_snapshots: PortfolioSnapshotRow[]
    saved_deals: SavedDealRow[]
    price_alerts: PriceAlertRow[]
    share_tokens: ShareTokenRow[]
  } = {
    watches: [...(initial?.watches ?? [])],
    portfolio_snapshots: [...(initial?.portfolioSnapshots ?? [])],
    saved_deals: [...(initial?.savedDeals ?? [])],
    price_alerts: [...(initial?.priceAlerts ?? [])],
    share_tokens: [...(initial?.shareTokens ?? [])],
  }

  let sequence = 0

  function nextId(prefix: string): string {
    sequence += 1
    return `${prefix}-${sequence}`
  }

  function nextTimestamp(): string {
    sequence += 1
    return new Date(Date.UTC(2024, 0, 1, 0, 0, sequence)).toISOString()
  }

  function canReadRow<T extends TableName>(table: T, row: TableRowMap[T], session: Session): boolean {
    if (session.role === 'service_role') {
      return true
    }

    if (!session.userId) {
      return false
    }

    switch (table) {
      case 'watches':
        return row.user_id === session.userId && row.deleted_at === null
      case 'portfolio_snapshots':
        return row.user_id === session.userId
      case 'saved_deals':
        return row.user_id === session.userId
      case 'price_alerts':
        return row.user_id === session.userId
      case 'share_tokens':
        return row.user_id === session.userId
      default:
        return false
    }
  }

  function getRows<T extends TableName>(table: T): TableRowMap[T][] {
    return state[table] as TableRowMap[T][]
  }

  function buildSelectBuilder<T extends TableName>(table: T, session: Session): SelectBuilder<TableRowMap[T]> {
    const equalsFilters: Array<{ column: keyof TableRowMap[T] & string; value: unknown }> = []
    const nullFilters: Array<{ column: keyof TableRowMap[T] & string; value: unknown }> = []
    const orders: Array<OrderSpec<TableRowMap[T]>> = []
    let rangeStart: number | null = null
    let rangeEnd: number | null = null
    let limitCount: number | null = null
    let searchExpression: string | null = null

    const execute = (): TableRowMap[T][] => {
      let rows = getRows(table)
        .filter((row) => canReadRow(table, row, session))
        .filter((row) => equalsFilters.every(({ column, value }) => row[column] === value))
        .filter((row) => nullFilters.every(({ column, value }) => row[column] === value))

      if (searchExpression && table === 'watches') {
        const term = extractSearchTerm(searchExpression)
        if (term) {
          rows = rows.filter((row) => {
            const watch = row as WatchRow
            return [watch.brand, watch.model, watch.reference, watch.serial_number, watch.notes]
              .filter((value): value is string => typeof value === 'string')
              .some((value) => value.toLowerCase().includes(term))
          }) as TableRowMap[T][]
        }
      }

      if (orders.length > 0) {
        rows = [...rows].sort((left, right) => {
          for (let index = orders.length - 1; index >= 0; index -= 1) {
            const order = orders[index]
            const comparison = compareValues(left[order.column], right[order.column])
            if (comparison !== 0) {
              return order.ascending ? comparison : -comparison
            }
          }
          return 0
        })
      }

      if (limitCount !== null) {
        rows = rows.slice(0, limitCount)
      }

      if (rangeStart !== null && rangeEnd !== null) {
        rows = rows.slice(rangeStart, rangeEnd + 1)
      }

      return rows
    }

    const builder: SelectBuilder<TableRowMap[T]> = {
      eq(column, value) {
        equalsFilters.push({ column, value })
        return builder
      },
      is(column, value) {
        nullFilters.push({ column, value })
        return builder
      },
      or(expression) {
        searchExpression = expression
        return builder
      },
      order(column, options) {
        orders.push({ column, ascending: options?.ascending ?? true })
        return builder
      },
      range(from, to) {
        rangeStart = from
        rangeEnd = to
        return builder
      },
      limit(count) {
        limitCount = count
        return builder
      },
      async maybeSingle() {
        return { data: execute()[0] ?? null, error: null }
      },
      async single() {
        return { data: execute()[0] as TableRowMap[T], error: null }
      },
      then(onfulfilled, onrejected) {
        return Promise.resolve({ data: execute(), error: null }).then(onfulfilled ?? undefined, onrejected ?? undefined)
      },
    }

    return builder
  }

  function normalizeWatch(insert: WatchInsert): WatchRow {
    const timestamp = nextTimestamp()
    return {
      id: insert.id ?? nextId('watch'),
      user_id: insert.user_id,
      brand: insert.brand,
      model: insert.model ?? null,
      reference: insert.reference,
      year: insert.year ?? null,
      condition: insert.condition ?? null,
      has_box: insert.has_box ?? false,
      has_papers: insert.has_papers ?? false,
      purchase_price: insert.purchase_price ?? null,
      purchase_date: insert.purchase_date ?? null,
      purchase_currency: insert.purchase_currency ?? 'USD',
      serial_number: insert.serial_number ?? null,
      notes: insert.notes ?? null,
      cover_photo_url: insert.cover_photo_url ?? null,
      is_sold: insert.is_sold ?? false,
      sold_price: insert.sold_price ?? null,
      sold_date: insert.sold_date ?? null,
      deleted_at: insert.deleted_at ?? null,
      created_at: timestamp,
      updated_at: timestamp,
    }
  }

  function normalizePortfolioSnapshot(insert: PortfolioSnapshotInsert): PortfolioSnapshotRow {
    return {
      id: insert.id ?? nextId('snapshot'),
      user_id: insert.user_id,
      snapshot_date: insert.snapshot_date,
      total_cost_basis: insert.total_cost_basis,
      total_market_value: insert.total_market_value,
      watch_count: insert.watch_count,
      brand_breakdown: insert.brand_breakdown ?? null,
      created_at: nextTimestamp(),
    }
  }

  function normalizeSavedDeal(insert: SavedDealInsert): SavedDealRow {
    return {
      id: insert.id ?? nextId('saved-deal'),
      user_id: insert.user_id,
      listing_id: insert.listing_id ?? null,
      listing_snapshot: insert.listing_snapshot,
      saved_at: nextTimestamp(),
    }
  }

  function normalizePriceAlert(insert: PriceAlertInsert): PriceAlertRow {
    const timestamp = nextTimestamp()
    return {
      id: insert.id ?? nextId('alert'),
      user_id: insert.user_id,
      brand: insert.brand,
      reference: insert.reference,
      direction: insert.direction,
      target_price: insert.target_price,
      currency: insert.currency ?? 'USD',
      is_active: insert.is_active ?? true,
      last_checked: insert.last_checked ?? null,
      triggered_at: insert.triggered_at ?? null,
      trigger_price: insert.trigger_price ?? null,
      notified_at: insert.notified_at ?? null,
      created_at: timestamp,
      updated_at: timestamp,
    }
  }

  function createClient(session: Session): Pick<SupabaseClient<Database>, 'from' | 'rpc'> {
    return {
      from(tableName) {
        const table = tableName as TableName

        return {
          select() {
            return buildSelectBuilder(table, session)
          },
          insert(payload) {
            if (table !== 'watches') {
              throw new Error(`Insert not implemented for ${table}`)
            }

            const inserted = normalizeWatch(payload as WatchInsert)
            state.watches.push(inserted)
            return {
              select() {
                return {
                  async single() {
                    return { data: inserted, error: null }
                  },
                }
              },
            }
          },
          update(payload) {
            if (table !== 'watches') {
              throw new Error(`Update not implemented for ${table}`)
            }

            const filters: Array<{ column: keyof WatchRow & string; value: unknown }> = []
            const nullChecks: Array<{ column: keyof WatchRow & string; value: unknown }> = []

            const applyUpdate = (): WatchRow | null => {
              const watch = state.watches.find((row) => {
                if (session.role !== 'service_role' && row.user_id !== session.userId) {
                  return false
                }

                return filters.every(({ column, value }) => row[column] === value)
                  && nullChecks.every(({ column, value }) => row[column] === value)
              })

              if (!watch) {
                return null
              }

              Object.assign(watch, payload, { updated_at: nextTimestamp() })
              return watch
            }

            const builder = {
              eq(column: keyof WatchRow & string, value: unknown) {
                filters.push({ column, value })
                return builder
              },
              is(column: keyof WatchRow & string, value: unknown) {
                nullChecks.push({ column, value })
                return builder
              },
              select() {
                return {
                  async maybeSingle() {
                    return { data: applyUpdate(), error: null }
                  },
                  async single() {
                    return { data: applyUpdate() as WatchRow, error: null }
                  },
                }
              },
            }

            return builder
          },
          upsert(payload, options) {
            if (table === 'portfolio_snapshots') {
              const insert = payload as PortfolioSnapshotInsert
              const existing = state.portfolio_snapshots.find(
                (row) => row.user_id === insert.user_id && row.snapshot_date === insert.snapshot_date,
              )
              const row = existing
                ? Object.assign(existing, {
                    total_cost_basis: insert.total_cost_basis,
                    total_market_value: insert.total_market_value,
                    watch_count: insert.watch_count,
                    brand_breakdown: insert.brand_breakdown ?? null,
                  })
                : normalizePortfolioSnapshot(insert)
              if (!existing) {
                state.portfolio_snapshots.push(row)
              }
              return {
                select() {
                  return {
                    async single() {
                      return { data: row, error: null }
                    },
                  }
                },
              }
            }

            if (table === 'saved_deals') {
              const insert = payload as SavedDealInsert
              const existing = state.saved_deals.find(
                (row) => row.user_id === insert.user_id && row.listing_id === (insert.listing_id ?? null),
              )
              const row = existing
                ? Object.assign(existing, { listing_snapshot: insert.listing_snapshot })
                : normalizeSavedDeal(insert)
              if (!existing) {
                state.saved_deals.push(row)
              }
              return {
                select() {
                  return {
                    async single() {
                      return { data: row, error: null }
                    },
                  }
                },
              }
            }

            if (table === 'price_alerts') {
              const insert = payload as PriceAlertInsert
              const existing = insert.id
                ? state.price_alerts.find((row) => row.id === insert.id)
                : undefined
              const row = existing
                ? Object.assign(existing, {
                    brand: insert.brand,
                    reference: insert.reference,
                    direction: insert.direction,
                    target_price: insert.target_price,
                    currency: insert.currency ?? existing.currency,
                    is_active: insert.is_active ?? existing.is_active,
                    last_checked: insert.last_checked ?? null,
                    triggered_at: insert.triggered_at ?? null,
                    trigger_price: insert.trigger_price ?? null,
                    notified_at: insert.notified_at ?? null,
                    updated_at: nextTimestamp(),
                  })
                : normalizePriceAlert(insert)
              if (!existing) {
                state.price_alerts.push(row)
              }
              return {
                select() {
                  return {
                    async single() {
                      return { data: row, error: null }
                    },
                  }
                },
              }
            }

            throw new Error(`Upsert not implemented for ${table} with onConflict ${String(options?.onConflict)}`)
          },
        }
      },
      async rpc(name, params) {
        if (name === 'create_share_token') {
          if (!session.userId) {
            throw new Error('Authentication required')
          }

          const token: ShareTokenRow = {
            id: nextId('share-token'),
            user_id: session.userId,
            token: nextId('token'),
            access: 'read_only',
            hide_prices: (params?.p_hide_prices as boolean | null | undefined) ?? true,
            view_count: 0,
            last_viewed: null,
            expires_at: (params?.p_expires_at as string | null | undefined) ?? null,
            created_at: nextTimestamp(),
          }
          state.share_tokens.push(token)
          return { data: [token], error: null }
        }

        if (name === 'get_shared_collection') {
          const tokenValue = params?.p_token as string
          const share = state.share_tokens.find((row) => row.token === tokenValue)
          if (!share) {
            return { data: [], error: null }
          }

          share.view_count += 1
          share.last_viewed = nextTimestamp()
          const sharedWatches = state.watches
            .filter((row) => row.user_id === share.user_id && row.deleted_at === null)
            .map((row) => {
              const payload: Record<string, unknown> = {
                id: row.id,
                brand: row.brand,
                model: row.model,
                reference: row.reference,
                year: row.year,
                condition: row.condition,
                hasBox: row.has_box,
                hasPapers: row.has_papers,
                coverPhotoUrl: row.cover_photo_url,
                isSold: row.is_sold,
              }

              if (!share.hide_prices) {
                payload.purchasePrice = row.purchase_price
                payload.purchaseCurrency = row.purchase_currency
                payload.soldPrice = row.sold_price
              }

              return payload
            })

          return {
            data: [{
              token: share.token,
              user_id: share.user_id,
              access: share.access,
              hide_prices: share.hide_prices ?? true,
              display_name: `Collector ${share.user_id}`,
              view_count: share.view_count,
              last_viewed: share.last_viewed,
              expires_at: share.expires_at,
              watches: sharedWatches,
            }],
            error: null,
          }
        }

        if (name === 'soft_delete_own_watch') {
          const watchId = (params as { p_watch_id: string } | null | undefined)?.p_watch_id
          if (session.userId) {
            const watch = state.watches.find(
              (row) => row.id === watchId && row.user_id === session.userId && row.deleted_at === null,
            )
            if (watch) {
              watch.deleted_at = nextTimestamp()
            }
          }
          return { data: null, error: null }
        }

        throw new Error(`RPC ${name} not implemented in test harness`)
      },
    }
  }

  return {
    createAuthenticatedClient(userId: string) {
      return createClient({ role: 'authenticated', userId })
    },
    createAdminClient() {
      return createClient({ role: 'service_role', userId: 'service-role' })
    },
    createAnonymousClient() {
      return createClient({ role: 'anon', userId: null })
    },
    createWatchesClientFactory(initialUserId: string) {
      let activeUserId = initialUserId
      return {
        setActiveUser(userId: string) {
          activeUserId = userId
        },
        createClient() {
          return createClient({ role: 'authenticated', userId: activeUserId })
        },
      }
    },
    state,
  }
}
