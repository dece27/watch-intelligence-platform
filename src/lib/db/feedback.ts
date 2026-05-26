import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

/**
 * Writes a feedback submission to the Supabase `feedback` table.
 *
 * The `user_email` column was added in migration 0015 and is not yet present
 * in the generated type definitions, so the insert payload is typed with `any`
 * to avoid a compile-time error while retaining runtime correctness.
 */
export async function submitFeedbackToSupabase(
  client: Pick<SupabaseClient<Database>, 'from'>,
  params: {
    userId: string
    message: string
    userEmail?: string
  },
): Promise<void> {
  const { error } = await (client.from('feedback') as any).insert({
    user_id: params.userId,
    message: params.message,
    user_email: params.userEmail ?? null,
  })

  if (error) throw error
}
