-- spine.ai's OWN database (SPINE_DB_URL) — never Procol's.
--
-- 004: watching procol-backend for new code (scripts/backend-watch.ts)
--   backend_watch_state — the last origin/main commit the watcher has dealt with,
--                         per repository and branch
--   backend_watch_log   — one row per check: which commits were new, which files
--                         changed, which features they reach, which runs followed
--
-- Idempotent: every statement can run again without error.

CREATE TABLE IF NOT EXISTS backend_watch_state (
  repo          text NOT NULL,             -- 'procol-backend'
  branch        text NOT NULL,             -- 'origin/main'
  last_seen_sha text NOT NULL,
  last_seen_at  timestamptz NOT NULL,      -- the commit's own date
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repo, branch)
);

CREATE TABLE IF NOT EXISTS backend_watch_log (
  id          bigserial PRIMARY KEY,
  checked_at  timestamptz NOT NULL DEFAULT now(),
  repo        text NOT NULL,
  branch      text NOT NULL,
  from_sha    text,                        -- null on the first check (baseline)
  to_sha      text NOT NULL,
  commits     integer NOT NULL,
  files       integer NOT NULL,
  fetched     boolean NOT NULL DEFAULT false,  -- did this check run `git fetch` first
  dry_run     boolean NOT NULL DEFAULT false,  -- a rehearsal: state was not advanced
  features    text[] NOT NULL DEFAULT '{}',
  mapping     jsonb NOT NULL DEFAULT '[]',     -- per file: how it was mapped and to what
  runs        jsonb NOT NULL DEFAULT '[]',     -- the targeted runs started, with their run ids
  summary     text                             -- the plain-English summary, as written to disk
);
CREATE INDEX IF NOT EXISTS backend_watch_log_checked ON backend_watch_log (repo, branch, checked_at DESC);
