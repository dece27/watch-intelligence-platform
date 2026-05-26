-- Replaces the insecure soft_delete_watch(uuid, uuid) pattern with a SECURITY
-- DEFINER function that enforces ownership via auth.uid() instead of accepting
-- an arbitrary p_user_id parameter.  The function is called by the client SDK
-- and the E2E test script; it bypasses the SELECT-USING-as-WITH-CHECK RLS
-- restriction that prevents a direct UPDATE from setting deleted_at.

create or replace function public.soft_delete_own_watch(p_watch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.watches
  set deleted_at = timezone('utc', now())
  where id = p_watch_id
    and user_id = auth.uid()
    and deleted_at is null;
end;
$$;

grant execute on function public.soft_delete_own_watch(uuid) to authenticated;
