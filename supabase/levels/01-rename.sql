-- ============================================================================
-- Level keys — 01-rename.sql  ("Level 1".."Level 4" → beginner · level-1..3)
-- ----------------------------------------------------------------------------
-- ⚠ Run ONLY AFTER the site code with the new keys is live (it reads both the
--   old and the new keys). Run before that and the live site reads nothing.
-- Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
--
-- One transaction; safe to re-run (a second run finds no old rows and changes
-- nothing). Old Level 1 was Beginner — the mapping is one CASE, and old and
-- new keys never share a value, so no row can collide with another.
-- If an admin already re-saved a page under its new key, that row wins and
-- the old copy is deleted. Then a CHECK stops any later old-key write.
-- Result: one table — rows per table and level, before and after.
-- Expected: every old key "after = 0"; every new key "after" = the old key's
-- "before" (+ pages already saved under the new key).
-- ============================================================================
begin;

create temp table lv_map (old text primary key, new text not null unique)
  on commit drop;
insert into lv_map values
  ('Level 1', 'beginner'), ('Level 2', 'level-1'),
  ('Level 3', 'level-2'),  ('Level 4', 'level-3');

create temp table lv_before on commit drop as
select tbl, level, count(*)::int as n
  from (select 'content_pages'::text as tbl, level from public.content_pages
        union all
        select 'page_backgrounds', level from public.page_backgrounds) t
 group by tbl, level;

-- 1) An old row whose page was already saved under the new key is a stale copy.
delete from public.content_pages o
 using lv_map m
 where o.level = m.old
   and exists (select 1 from public.content_pages n
                where n.level = m.new and n.month = o.month);
delete from public.page_backgrounds o
 using lv_map m
 where o.level = m.old
   and exists (select 1 from public.page_backgrounds n
                where n.level = m.new and n.page = o.page and n.month = o.month);

-- 2) Every remaining old row → its new key.
update public.content_pages set level = case level
    when 'Level 1' then 'beginner' when 'Level 2' then 'level-1'
    when 'Level 3' then 'level-2'  when 'Level 4' then 'level-3' end
 where level in ('Level 1', 'Level 2', 'Level 3', 'Level 4');
update public.page_backgrounds set level = case level
    when 'Level 1' then 'beginner' when 'Level 2' then 'level-1'
    when 'Level 3' then 'level-2'  when 'Level 4' then 'level-3' end
 where level in ('Level 1', 'Level 2', 'Level 3', 'Level 4');

-- 3) From now on only the four new keys can be stored.
alter table public.content_pages drop constraint if exists content_pages_level_key;
alter table public.content_pages add constraint content_pages_level_key
  check (level in ('beginner', 'level-1', 'level-2', 'level-3'));
alter table public.page_backgrounds drop constraint if exists page_backgrounds_level_key;
alter table public.page_backgrounds add constraint page_backgrounds_level_key
  check (level in ('beginner', 'level-1', 'level-2', 'level-3'));

-- 4) The result table.
select coalesce(b.tbl, a.tbl) as "table",
       coalesce(b.level, a.level) as level,
       coalesce(b.n, 0) as before,
       coalesce(a.n, 0) as after
  from lv_before b
  full join (select tbl, level, count(*)::int as n
               from (select 'content_pages'::text as tbl, level
                       from public.content_pages
                     union all
                     select 'page_backgrounds', level
                       from public.page_backgrounds) t
              group by tbl, level) a
    on a.tbl = b.tbl and a.level = b.level
 order by 1, 2;

commit;
