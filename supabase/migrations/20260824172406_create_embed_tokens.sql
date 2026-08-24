create table public.embed_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

comment on table public.embed_tokens is 'Bearer tokens for the view-only /embed/tickets page, embeddable cross-domain (cookie auth does not survive third-party iframes). Only the SHA-256 hash is stored; the raw token is shown once at creation.';
comment on column public.embed_tokens.token_hash is 'SHA-256 hex digest of the raw token. The raw token itself is never persisted.';
comment on column public.embed_tokens.revoked_at is 'Set to revoke the token immediately; null means active. No time-based expiry by design — revoke manually instead.';

alter table public.embed_tokens enable row level security;

-- The main app's token-management UI runs as a signed-in user; every
-- logged-in user can see/manage all tokens, matching this app's existing
-- no-per-user-ownership model (same as inbound_emails).
create policy "Authenticated users can manage embed tokens"
  on public.embed_tokens
  for all
  to authenticated
  using (true)
  with check (true);

-- Narrow, anon-callable check for the embed route to validate an incoming
-- token without exposing the table itself (or a service-role key) to it.
-- security definer runs as the function owner, bypassing RLS just for this
-- one exists-and-not-revoked check.
create or replace function public.is_embed_token_valid(check_token_hash text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.embed_tokens
    where token_hash = check_token_hash
      and revoked_at is null
  );
$$;

revoke all on function public.is_embed_token_valid(text) from public;
grant execute on function public.is_embed_token_valid(text) to anon, authenticated;
