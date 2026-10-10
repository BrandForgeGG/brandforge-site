-- The weekly calendar now posts more than carousels: a quote, a tip, a carousel, an ad or announcement and a poll
-- each day. `format` says which one a row is made as; existing rows stay carousels.
alter table public.content_calendar_posts add column if not exists format text not null default 'carousel';
alter table public.content_calendar_posts drop constraint if exists content_calendar_posts_format_check;
alter table public.content_calendar_posts add constraint content_calendar_posts_format_check check (format in ('carousel','quote','tip','ad','announcement','question'));
