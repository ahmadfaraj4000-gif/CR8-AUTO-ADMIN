-- CR8 Autos Admin Portal schema
-- Run this whole file in Supabase SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique,
  role text not null default 'viewer' check (role in ('admin', 'front_desk', 'salesman', 'technician', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text,
  email text,
  vehicle text,
  service text,
  message text,
  appointment_date date not null,
  appointment_time text,
  status text not null default 'new' check (
    status in (
      'new',
      'contacted',
      'follow_up_needed',
      'confirmed',
      'car_in_shop',
      'waiting_on_parts',
      'completed',
      'cancelled',
      'archived'
    )
  ),
  notes text,
  assigned_to uuid references public.profiles(id) on delete set null,
  source text default 'website',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_type text not null default 'repair_lead' check (lead_type in ('repair_lead', 'buy_car', 'sell_car', 'trade_in', 'general_inquiry')),
  name text not null,
  phone text,
  email text,
  vehicle text,
  budget text,
  message text,
  source text default 'website',
  status text not null default 'new' check (status in ('new', 'contacted', 'negotiating', 'appointment_set', 'closed_won', 'closed_lost', 'archived')),
  notes text,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  table_name text not null,
  record_id text not null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists bookings_touch_updated_at on public.bookings;
create trigger bookings_touch_updated_at
before update on public.bookings
for each row execute procedure public.touch_updated_at();

drop trigger if exists leads_touch_updated_at on public.leads;
create trigger leads_touch_updated_at
before update on public.leads
for each row execute procedure public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute procedure public.touch_updated_at();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin', 'front_desk', 'salesman', 'technician'), false);
$$;

alter table public.profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.leads enable row level security;
alter table public.activity_log enable row level security;

-- profiles policies

drop policy if exists "profiles_select_staff" on public.profiles;
create policy "profiles_select_staff"
on public.profiles
for select
using (auth.role() = 'authenticated');

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- bookings policies

drop policy if exists "bookings_public_insert" on public.bookings;
create policy "bookings_public_insert"
on public.bookings
for insert
to anon, authenticated
with check (true);

drop policy if exists "bookings_staff_select" on public.bookings;
create policy "bookings_staff_select"
on public.bookings
for select
to authenticated
using (public.is_staff());

drop policy if exists "bookings_staff_update" on public.bookings;
create policy "bookings_staff_update"
on public.bookings
for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "bookings_admin_delete" on public.bookings;
create policy "bookings_admin_delete"
on public.bookings
for delete
to authenticated
using (public.current_user_role() = 'admin');

-- leads policies

drop policy if exists "leads_public_insert" on public.leads;
create policy "leads_public_insert"
on public.leads
for insert
to anon, authenticated
with check (true);

drop policy if exists "leads_staff_select" on public.leads;
create policy "leads_staff_select"
on public.leads
for select
to authenticated
using (
  public.current_user_role() in ('admin', 'front_desk')
  or assigned_to = auth.uid()
  or public.current_user_role() = 'salesman'
);

drop policy if exists "leads_staff_update" on public.leads;
create policy "leads_staff_update"
on public.leads
for update
to authenticated
using (
  public.current_user_role() in ('admin', 'front_desk')
  or assigned_to = auth.uid()
  or public.current_user_role() = 'salesman'
)
with check (
  public.current_user_role() in ('admin', 'front_desk')
  or assigned_to = auth.uid()
  or public.current_user_role() = 'salesman'
);

-- activity log policies

drop policy if exists "activity_log_staff_select" on public.activity_log;
create policy "activity_log_staff_select"
on public.activity_log
for select
to authenticated
using (public.is_staff());

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.bookings to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.leads to anon, authenticated;
grant select on public.activity_log to authenticated;

create index if not exists bookings_appointment_date_idx on public.bookings (appointment_date);
create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_assigned_to_idx on public.leads (assigned_to);
