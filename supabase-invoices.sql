-- Install once in the CR8 project SQL Editor. This adds tables only; it does not modify customers/bookings.
begin;
create table if not exists public.invoices (
  id uuid primary key,
  revision uuid not null,
  document jsonb not null check (jsonb_typeof(document) = 'object'
    and document ? 'invoice' and document ? 'items' and document ? 'payments'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.invoice_versions (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.invoices(id),
  revision uuid not null,
  document jsonb not null,
  saved_by uuid references auth.users(id),
  saved_at timestamptz not null default now(),
  unique (invoice_id, revision)
);
create index if not exists invoice_versions_invoice_idx on public.invoice_versions (invoice_id, saved_at desc);
alter table public.invoices enable row level security;
alter table public.invoice_versions enable row level security;

create or replace function public.can_manage_invoices() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and active = true and role in ('admin', 'front_desk')); $$;
revoke all on function public.can_manage_invoices() from public;
grant execute on function public.can_manage_invoices() to authenticated;

drop policy if exists invoices_staff_read on public.invoices;
create policy invoices_staff_read on public.invoices for select to authenticated using (public.can_manage_invoices());
drop policy if exists invoices_staff_insert on public.invoices;
create policy invoices_staff_insert on public.invoices for insert to authenticated with check (public.can_manage_invoices());
drop policy if exists invoices_staff_update on public.invoices;
create policy invoices_staff_update on public.invoices for update to authenticated using (public.can_manage_invoices()) with check (public.can_manage_invoices());
drop policy if exists invoice_versions_staff_read on public.invoice_versions;
create policy invoice_versions_staff_read on public.invoice_versions for select to authenticated using (public.can_manage_invoices());
grant select, insert, update on public.invoices to authenticated;
grant select on public.invoice_versions to authenticated;
revoke all on public.invoices, public.invoice_versions from anon;
revoke delete on public.invoices from authenticated;
revoke insert, update, delete on public.invoice_versions from authenticated;

create or replace function public.keep_invoice_version() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.invoice_versions (invoice_id, revision, document, saved_by)
  values (new.id, new.revision, new.document, auth.uid());
  return new;
end;
$$;
revoke all on function public.keep_invoice_version() from public;
drop trigger if exists invoices_keep_version on public.invoices;
create trigger invoices_keep_version after insert or update on public.invoices
for each row execute function public.keep_invoice_version();
commit;
