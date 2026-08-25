-- The app no longer has any login/signup flow, so there is never an
-- "authenticated" Supabase session — only "anon". Update RLS to match:
-- anon gets what authenticated used to have. created_by on embed_tokens
-- can no longer be populated from a real session, so it's now nullable.

alter table public.embed_tokens alter column created_by drop not null;
comment on column public.embed_tokens.created_by is 'auth.users id of the creator, when the app still had login. Null for tokens created after auth was removed.';

drop policy if exists "Authenticated users can manage embed tokens" on public.embed_tokens;
create policy "Anyone can manage embed tokens"
  on public.embed_tokens
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can read inbound emails" on public.inbound_emails;
create policy "Anyone can read inbound emails"
  on public.inbound_emails
  for select
  to anon, authenticated
  using (true);

grant execute on function public.is_embed_token_valid(text) to anon, authenticated;
