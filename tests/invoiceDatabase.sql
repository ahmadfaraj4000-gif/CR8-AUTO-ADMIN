-- Integration test: run only against a fresh, disposable PostgreSQL database.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
create table public.profiles(id uuid primary key, role text not null, active boolean not null default true);
insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
insert into profiles(id, role) values ('00000000-0000-0000-0000-000000000001','admin'), ('00000000-0000-0000-0000-000000000002','viewer');
\ir ../supabase-invoices.sql
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into invoices(id,revision,document) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','{"invoice":{},"items":[],"payments":[{"amount":50,"method":"Cash"}]}');
update invoices set revision='20000000-0000-0000-0000-000000000002', document='{"invoice":{},"items":[],"payments":[{"amount":50,"method":"Cash"},{"amount":66,"method":"Card"}]}' where id='10000000-0000-0000-0000-000000000001' and revision='20000000-0000-0000-0000-000000000001';
-- Simulated stale writer must update zero rows.
update invoices set revision='20000000-0000-0000-0000-000000000003' where id='10000000-0000-0000-0000-000000000001' and revision='20000000-0000-0000-0000-000000000001';
do $$ begin
 if (select count(*) from invoice_versions) <> 2 then raise exception 'Audit versions missing'; end if;
 if (select jsonb_array_length(document->'payments') from invoices) <> 2 then raise exception 'Payments lost'; end if;
 if has_table_privilege('authenticated','invoice_versions','UPDATE') then raise exception 'Audit unexpectedly editable'; end if;
 if has_table_privilege('anon','invoices','SELECT') then raise exception 'Anonymous invoice access'; end if;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
 if exists(select 1 from invoices) or exists(select 1 from invoice_versions) then raise exception 'Viewer accessed invoices'; end if;
 begin
  insert into invoices(id,revision,document) values (gen_random_uuid(),gen_random_uuid(),'{"invoice":{},"items":[],"payments":[]}');
  raise exception 'Viewer inserted an invoice';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
-- Re-running the migration must preserve the rows and versions.
\ir ../supabase-invoices.sql
do $$ begin if (select count(*) from invoices) <> 1 or (select count(*) from invoice_versions) <> 2 then raise exception 'Migration damaged records'; end if; end $$;
select 'PASS: atomic payments, revision conflict protection, immutable audit, staff-only access, repeatable migration' as result;
