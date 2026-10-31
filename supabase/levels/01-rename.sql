-- ============================================================================
-- Level keys — 01-rename.sql  ("Level 1".."Level 4" → beginner · level-1..3)
-- ----------------------------------------------------------------------------
-- ⚠ Run ONLY AFTER the site code with the new keys is live (it reads both the
--   old and the new keys). Run before that and the live site reads nothing.
-- Supabase Dashboard → SQL Editor → New query → paste this whole file →
-- click once inside the editor (so nothing is selected) → Run.
--
-- ONE statement (a DO block): all of it happens, or none of it does. No temp
-- table, no begin/commit. Old Level 1 was Beginner — old and new keys never
-- share a value, so no row can collide with another.
--   1) An old row whose page was already saved under its new key is a stale
--      copy and is deleted (the new row wins).
--   2) Every other old row gets its new key.
--   3) If any row still has a key other than the four new ones, it stops
--      with an error ("... nothing was changed ...") and undoes 1) and 2).
--   4) A CHECK on each table: from now on only the four new keys can be
--      stored (added once; a re-run leaves it as it is).
-- Result: "Success. No rows returned" — no table. Check right after with
-- 00-precheck.sql (every row "new"); the before numbers are the 00 run made
-- before this one.
-- Re-running after success changes nothing and gives no error.
-- If only some lines inside the block get selected and run, they run as plain
-- SQL. The site reads both old and new keys, so pages look the same; running
-- the whole file again finishes the job. Clearing the selection stays a must.
-- ============================================================================
do $$
declare
  v_left text;
begin
  -- 1) Stale old copies: the page is already saved under its new key.
  delete from public.content_pages o
   using (values ('Level 1', 'beginner'), ('Level 2', 'level-1'),
                 ('Level 3', 'level-2'),  ('Level 4', 'level-3')) m (old, new)
   where o.level = m.old
     and exists (select 1 from public.content_pages n
                  where n.level = m.new and n.month = o.month);
  delete from public.page_backgrounds o
   using (values ('Level 1', 'beginner'), ('Level 2', 'level-1'),
                 ('Level 3', 'level-2'),  ('Level 4', 'level-3')) m (old, new)
   where o.level = m.old
     and exists (select 1 from public.page_backgrounds n
                  where n.level = m.new and n.page = o.page
                    and n.month = o.month);

  -- 2) Every remaining old row → its new key.
  update public.content_pages set level = case level
      when 'Level 1' then 'beginner' when 'Level 2' then 'level-1'
      when 'Level 3' then 'level-2'  when 'Level 4' then 'level-3' end
   where level in ('Level 1', 'Level 2', 'Level 3', 'Level 4');
  update public.page_backgrounds set level = case level
      when 'Level 1' then 'beginner' when 'Level 2' then 'level-1'
      when 'Level 3' then 'level-2'  when 'Level 4' then 'level-3' end
   where level in ('Level 1', 'Level 2', 'Level 3', 'Level 4');

  -- 3) Only the four new keys may be left — otherwise undo everything.
  select string_agg(format('%s "%s" (%s)', tbl, level, n), ', '
                    order by tbl, level)
    into v_left
    from (select tbl, level, count(*) as n
            from (select 'content_pages'::text as tbl, level
                    from public.content_pages
                  union all
                  select 'page_backgrounds', level
                    from public.page_backgrounds) t
           where level not in ('beginner', 'level-1', 'level-2', 'level-3')
           group by tbl, level) x;
  if v_left is not null then
    raise exception 'Level rename stopped, nothing was changed. Rows with a key other than beginner/level-1/level-2/level-3: %', v_left;
  end if;

  -- 4) From now on only the four new keys can be stored.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.content_pages'::regclass
                    and conname = 'content_pages_level_key') then
    alter table public.content_pages add constraint content_pages_level_key
      check (level in ('beginner', 'level-1', 'level-2', 'level-3'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.page_backgrounds'::regclass
                    and conname = 'page_backgrounds_level_key') then
    alter table public.page_backgrounds add constraint page_backgrounds_level_key
      check (level in ('beginner', 'level-1', 'level-2', 'level-3'));
  end if;
end
$$;
