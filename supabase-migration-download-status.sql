-- Add a per-song download status used by the local download-queue CLI.
-- null  = not requested (default)
-- 'queued'      = user clicked Download, awaiting CLI to process
-- 'downloading' = CLI is currently working on it
-- 'done'        = MP3 uploaded, file_url is set
-- 'error'       = failed; download_error has the reason

alter table songs add column if not exists download_status text;
alter table songs add column if not exists download_error text;

create index if not exists songs_download_status_idx
  on songs (download_status)
  where download_status is not null;
