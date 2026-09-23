create extension if not exists pgcrypto;

create type if not exists public.app_role as enum ('admin', 'operator', 'client', 'designer', 'viewer');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role public.app_role not null default 'viewer',
  company_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists company_name text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.profiles
  alter column role type public.app_role using role::text::public.app_role;

alter table public.profiles
  alter column role set default 'viewer';

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  title text,
  description text,
  status text default 'DRAFT',
  budget text,
  timeline text,
  progress integer default 0,
  next_milestone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  user_id uuid,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique(project_id, user_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  title text,
  owner_id uuid,
  status text default 'TODO',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  milestone text,
  status text default 'PENDING',
  owner text default 'BrandForge Team',
  comment text,
  updated_at timestamptz not null default now(),
  unique(project_id, milestone)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.project_approvals enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Project members can view project data" on public.projects;
drop policy if exists "Owners can manage projects" on public.projects;
drop policy if exists "Project members can view tasks" on public.tasks;
drop policy if exists "Project owners can manage tasks" on public.tasks;
drop policy if exists "Project members can view approvals" on public.project_approvals;
drop policy if exists "Project owners can manage approvals" on public.project_approvals;
drop policy if exists "Project members can view messages" on public.messages;
drop policy if exists "Project members can add messages" on public.messages;

create policy "Profiles are viewable by owner" on public.profiles
for select using (auth.uid() = id);

create policy "Users can update their own profile" on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users can insert their own profile" on public.profiles
for insert with check (auth.uid() = id);

create policy "Project members can view project data" on public.projects
for select using (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = public.projects.id and pm.user_id = auth.uid()
  ) or owner_id = auth.uid()
);

create policy "Owners can manage projects" on public.projects
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "Project members can view tasks" on public.tasks
for select using (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = public.tasks.project_id and pm.user_id = auth.uid()
  ) or exists (
    select 1 from public.projects p
    where p.id = public.tasks.project_id and p.owner_id = auth.uid()
  )
);

create policy "Project owners can manage tasks" on public.tasks
for all using (
  exists (
    select 1 from public.projects p
    where p.id = public.tasks.project_id and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = public.tasks.project_id and p.owner_id = auth.uid()
  )
);

create policy "Project members can view approvals" on public.project_approvals
for select using (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = public.project_approvals.project_id and pm.user_id = auth.uid()
  ) or exists (
    select 1 from public.projects p
    where p.id = public.project_approvals.project_id and p.owner_id = auth.uid()
  )
);

create policy "Project owners can manage approvals" on public.project_approvals
for all using (
  exists (
    select 1 from public.projects p
    where p.id = public.project_approvals.project_id and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = public.project_approvals.project_id and p.owner_id = auth.uid()
  )
);

create policy "Project members can view messages" on public.messages
for select using (
  exists (
    select 1 from public.project_members pm
    where pm.project_id = public.messages.project_id and pm.user_id = auth.uid()
  ) or exists (
    select 1 from public.projects p
    where p.id = public.messages.project_id and p.owner_id = auth.uid()
  )
);

create policy "Project members can add messages" on public.messages
for insert with check (
  sender_id = auth.uid() and (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = public.messages.project_id and pm.user_id = auth.uid()
    ) or exists (
      select 1 from public.projects p
      where p.id = public.messages.project_id and p.owner_id = auth.uid()
    )
  )
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role, company_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    'viewer',
    new.raw_user_meta_data ->> 'company_name'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    company_name = excluded.company_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.profiles (id, email, full_name, avatar_url, role, company_name)
values
  ('11111111-1111-4111-8111-111111111111', 'alicia@brandforge.gg', 'Alicia Winters', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330', 'admin', 'BrandForge Studio'),
  ('22222222-2222-4222-8222-222222222222', 'nora@brandforge.gg', 'Nora Patel', 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80', 'operator', 'BrandForge Studio'),
  ('33333333-3333-4333-8333-333333333333', 'lena@brandforge.gg', 'Lena Brooks', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2', 'designer', 'BrandForge Studio')
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  avatar_url = excluded.avatar_url,
  role = excluded.role,
  company_name = excluded.company_name;

insert into public.projects (id, owner_id, title, description, status, budget, timeline, progress, next_milestone)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'BrandForge Launch Site', 'Premium founder-facing website and conversion funnel for the BrandForge product rollout.', 'IN_PROGRESS', '$8,400', '6 weeks', 68, 'Design QA + launch checklist'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'Creator CRM Platform', 'AI-assisted creator operations platform with campaign automation and reporting.', 'PLANNING', '$12,000', '10 weeks', 34, 'Scope lock + specialist brief')
on conflict (id) do nothing;

insert into public.project_members (project_id, user_id, role)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'operator'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'designer'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'operator')
on conflict (project_id, user_id) do nothing;

insert into public.tasks (id, project_id, title, owner_id, status, due_date)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Finalize onboarding questionnaire', '22222222-2222-4222-8222-222222222222', 'DONE', current_date),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Review visual identity handoff', '33333333-3333-4333-8333-333333333333', 'IN_PROGRESS', current_date + 1),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Draft launch announcement', '22222222-2222-4222-8222-222222222222', 'TODO', current_date + 2)
on conflict (id) do nothing;

insert into public.messages (id, project_id, sender_id, body)
values
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'We are on track for the launch checklist. Final signoff is due Friday.'),
  ('12121212-1212-4121-8121-121212121212', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'The revised hero direction is now in the shared folder.')
on conflict (id) do nothing;