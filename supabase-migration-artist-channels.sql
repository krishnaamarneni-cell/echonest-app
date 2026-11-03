-- Migration: let followed_channels hold artists as well as news and podcasts
-- Run this in the Supabase SQL editor, after supabase-migration-followed-channels.sql.
--
-- Adding an artist is adding a YouTube music channel to a third list, so it
-- reuses the same table rather than getting one of its own. The only thing
-- standing in the way is the CHECK constraint, which was written when there
-- were two categories — without this, "Add artist" fails with a constraint
-- violation and the button silently rolls back.

alter table public.followed_channels
  drop constraint if exists followed_channels_category_check;

alter table public.followed_channels
  add constraint followed_channels_category_check
    check (category in ('news', 'podcast', 'music'));
