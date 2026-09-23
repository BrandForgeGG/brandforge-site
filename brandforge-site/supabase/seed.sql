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
