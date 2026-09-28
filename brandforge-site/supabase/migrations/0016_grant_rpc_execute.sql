-- 0016: restore EXECUTE on the 0014/0015 RPCs for the caller that actually uses them.
--
-- The routes call these functions through the request-scoped user client
-- (project-db.db() -> createSupabaseServerClient), i.e. as the signed-in
-- `authenticated` role with row level security enforced — the same posture as
-- the plain table queries the functions replaced. 0014/0015 revoked EXECUTE
-- from every client role on the assumption the routes were service-role only;
-- that assumption was wrong: every sidebar call came back with
-- `42501 permission denied`, the app logged it, and recents rendered empty.
--
-- Until this runs, the app bridges the call through the service role
-- (rpcForCaller in lib/project-db.ts, logging a warning per call). After this
-- runs, the session client succeeds directly, RLS scopes the rows again, and
-- the bridge goes quiet.
--
-- anon stays revoked — unauthenticated callers have no business here. Under
-- `security invoker` the tables' own RLS policies do the row-level work for
-- whoever executes.

grant execute on function public.replace_draft_milestones(uuid, jsonb) to authenticated;
grant execute on function public.replace_draft_tasks(uuid, jsonb) to authenticated;
grant execute on function public.get_conversation_summaries(uuid) to authenticated;
