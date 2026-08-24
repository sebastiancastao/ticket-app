alter table public.inbound_emails
  add column if not exists is_read boolean not null default false;

comment on column public.inbound_emails.is_read is 'Read/unread status of the email in the source mailbox, as forwarded by n8n (e.g. IMAP \Seen flag, Gmail UNREAD label, Outlook isRead).';
