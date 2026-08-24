create table if not exists public.inbound_emails (
  id text primary key,
  from_address text not null,
  subject text not null default '',
  body text not null default '',
  received_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.inbound_emails is 'Emails pushed in by the n8n workflow that reads the mailbox; source of the /tickets email-extraction board.';
comment on column public.inbound_emails.id is 'Original message id from the mail provider, as forwarded by n8n. Primary key so repeat webhook deliveries upsert instead of duplicating.';
comment on column public.inbound_emails.received_at is 'Timestamp the email was received in the source mailbox (from n8n), not when this app ingested it.';
comment on column public.inbound_emails.created_at is 'When this app ingested the row via the n8n webhook.';

create index if not exists inbound_emails_received_at_idx
  on public.inbound_emails (received_at desc);

alter table public.inbound_emails enable row level security;

create policy "Authenticated users can read inbound emails"
  on public.inbound_emails
  for select
  to authenticated
  using (true);
