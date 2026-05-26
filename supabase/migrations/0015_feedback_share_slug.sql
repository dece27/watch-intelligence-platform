-- Add user_email column to feedback table so the submitter's email can be
-- stored alongside the anonymous-safe user_id reference.
alter table public.feedback add column if not exists user_email text;

-- Add a human-readable slug column to share_tokens so users can create
-- custom share URLs (e.g. /share/my-rolex-collection) in addition to the
-- existing random-token approach.
alter table public.share_tokens add column if not exists slug text;

-- Enforce slug uniqueness globally (partial index ignores NULL slugs).
create unique index if not exists share_tokens_slug_idx
  on public.share_tokens (slug)
  where slug is not null;

-- ---------------------------------------------------------------------------
-- create_or_update_share_by_slug
-- Creates a new share token for the authenticated user with the given slug,
-- or updates an existing one owned by that user.  Raises 'slug_taken' if the
-- slug is already claimed by a different user.
-- ---------------------------------------------------------------------------
create or replace function public.create_or_update_share_by_slug(
  p_slug       text,
  p_hide_prices boolean     default true,
  p_expires_at  timestamptz default null
)
returns setof public.share_tokens
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_share   public.share_tokens%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Check whether the slug is already in use.
  select *
  into   v_share
  from   public.share_tokens
  where  slug = p_slug
  limit  1;

  if found and v_share.user_id <> v_user_id then
    raise exception 'slug_taken';
  end if;

  if found and v_share.user_id = v_user_id then
    -- Update the existing share token owned by this user.
    update public.share_tokens
    set    hide_prices = coalesce(p_hide_prices, true),
           expires_at  = p_expires_at
    where  id = v_share.id
    returning * into v_share;
  else
    -- Create a new share token with the requested slug.
    insert into public.share_tokens (user_id, slug, hide_prices, expires_at)
    values (v_user_id, p_slug, coalesce(p_hide_prices, true), p_expires_at)
    returning * into v_share;
  end if;

  return query select * from public.share_tokens where id = v_share.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_shared_collection_by_slug
-- Returns a shared collection (token metadata + watch snapshot) looked up by
-- the human-readable slug.  Uses SECURITY DEFINER so it can read watches
-- belonging to the share owner even when the viewer is unauthenticated.
-- Increments the view_count on each call (same behaviour as
-- get_shared_collection).
-- ---------------------------------------------------------------------------
create or replace function public.get_shared_collection_by_slug(p_slug text)
returns table (
  token        text,
  user_id      uuid,
  access       public.share_access,
  hide_prices  boolean,
  display_name text,
  view_count   integer,
  last_viewed  timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz,
  watches      jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.share_tokens%rowtype;
begin
  select *
  into   v_share
  from   public.share_tokens
  where  slug = p_slug
    and  (expires_at is null or expires_at > timezone('utc', now()))
  limit  1;

  if not found then
    return;
  end if;

  -- Increment view counter.
  update public.share_tokens
  set    view_count  = coalesce(view_count, 0) + 1,
         last_viewed = timezone('utc', now())
  where  id = v_share.id
  returning * into v_share;

  return query
  select
    v_share.token,
    v_share.user_id,
    v_share.access,
    v_share.hide_prices,
    p.display_name,
    v_share.view_count,
    v_share.last_viewed,
    v_share.expires_at,
    v_share.created_at,
    coalesce(
      jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id',              w.id,
            'brand',           w.brand,
            'model',           w.model,
            'referenceNumber', w.reference,
            'year',            w.year,
            'condition',       case lower(w.condition::text)
                                 when 'unworn'    then 'mint'
                                 when 'mint'      then 'mint'
                                 when 'excellent' then 'excellent'
                                 when 'very good' then 'excellent'
                                 when 'good'      then 'good'
                                 when 'fair'      then 'fair'
                                 else                  'good'
                               end,
            'category',        w.category,
            'hasBox',          w.has_box,
            'hasPapers',       w.has_papers,
            'imageUrl',        w.cover_photo_url,
            'movement',        w.movement,
            'caseMaterial',    w.case_material,
            'caseDiameter',    w.case_diameter,
            'notes',           w.notes
          )
        )
      ) filter (where w.id is not null),
      '[]'::jsonb
    )
  from   public.profiles p
  left join public.watches w
         on w.user_id    = v_share.user_id
        and w.deleted_at is null
  where  p.id = v_share.user_id
  group  by p.display_name,
            v_share.token,
            v_share.user_id,
            v_share.access,
            v_share.hide_prices,
            v_share.view_count,
            v_share.last_viewed,
            v_share.expires_at,
            v_share.created_at;
end;
$$;
