-- ============================================================================
-- Level keys — 00-precheck.sql  (READ-ONLY, changes nothing)
-- ----------------------------------------------------------------------------
-- Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
-- Run it before 01-rename.sql, and again afterwards.
--
-- One row per table and stored level value:
--   "old → <new key>"   moves when 01-rename.sql runs. "(N already saved as
--                       <new key>: old copy dropped)" = an admin re-saved that
--                       page with the new site, so the new row wins.
--   "new"               already a new key (beginner · level-1 · level-2 · level-3)
--   "UNKNOWN — …"       anything else: do not run 01, report it.
-- After 01-rename.sql every row must say "new".
-- ============================================================================
with m (old, new) as (
  values ('Level 1', 'beginner'), ('Level 2', 'level-1'),
         ('Level 3', 'level-2'),  ('Level 4', 'level-3')
),
t as (
  select 'content_pages'::text as tbl, level, month, ''::text as page
    from public.content_pages
  union all
  select 'page_backgrounds', level, month, page
    from public.page_backgrounds
)
select t.tbl as "table",
       t.level,
       count(*)::int as rows,
       case
         when m.old is not null then
           'old → ' || m.new ||
           case when count(n.level) > 0
                then ' (' || count(n.level) || ' already saved as ' || m.new
                     || ': old copy dropped)'
                else '' end
         when t.level in (select new from m) then 'new'
         else 'UNKNOWN — stop and report'
       end as note
  from t
  left join m on m.old = t.level
  left join t n
    on n.tbl = t.tbl and n.level = m.new and n.month = t.month and n.page = t.page
 group by t.tbl, t.level, m.old, m.new
 order by 1, 2;
