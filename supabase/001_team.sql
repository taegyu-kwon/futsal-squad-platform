-- The service-role API is the only database writer. No browser key can read this table.
create table if not exists public.shared_team (
  id text primary key check (id = 'team'),
  revision bigint not null check (revision > 0),
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null
);
alter table public.shared_team enable row level security;
revoke all on public.shared_team from anon, authenticated;
grant select, insert, update on public.shared_team to service_role;

-- Private objects are served through short-lived signed URLs from our API.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('team-media','team-media',false,8000000,array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
