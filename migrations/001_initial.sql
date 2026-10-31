CREATE TABLE IF NOT EXISTS "user" (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false, image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "isAnonymous" boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS "session" (
  id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS account (
  id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" text, "refreshToken" text, "idToken" text,
  "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text, password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "rateLimit" (id text PRIMARY KEY, key text NOT NULL UNIQUE, count integer NOT NULL, "lastRequest" bigint NOT NULL);
CREATE INDEX IF NOT EXISTS sc_auth_session_user ON "session"("userId");

CREATE TABLE sc_projects (
  id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK(revision>=0), snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days', deleted_at timestamptz
);
CREATE INDEX sc_projects_owner ON sc_projects(owner_id,updated_at DESC);
CREATE TABLE sc_revisions (
  project_id uuid NOT NULL REFERENCES sc_projects(id) ON DELETE CASCADE,
  revision integer NOT NULL, snapshot jsonb NOT NULL, command_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,revision)
);
CREATE TABLE sc_commands (
  project_id uuid NOT NULL REFERENCES sc_projects(id) ON DELETE CASCADE,
  command_id text NOT NULL, command_hash text NOT NULL, result_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,command_id),
  FOREIGN KEY(project_id,result_revision) REFERENCES sc_revisions(project_id,revision) ON DELETE CASCADE
);
CREATE TABLE sc_events (
  project_id uuid NOT NULL REFERENCES sc_projects(id) ON DELETE CASCADE,
  id text NOT NULL, revision integer NOT NULL, event jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,id)
);
CREATE TABLE sc_assets (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES sc_projects(id) ON DELETE CASCADE,
  owner_id text NOT NULL, subject_id text NOT NULL,
  purpose text NOT NULL CHECK(purpose IN ('performer','garment','preview')),
  pathname text NOT NULL UNIQUE, content_type text NOT NULL,
  bytes integer NOT NULL CHECK(bytes>0 AND bytes<10000000), sha256 text NOT NULL,
  width integer NOT NULL CHECK(width>0), height integer NOT NULL CHECK(height>0), provenance text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
  deleted_at timestamptz, storage_deleted_at timestamptz
);
CREATE INDEX sc_assets_project ON sc_assets(project_id);
CREATE TABLE sc_upload_intents (
  pathname text PRIMARY KEY, owner_id text NOT NULL, project_id uuid NOT NULL REFERENCES sc_projects(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK(purpose IN ('performer','garment')), subject_id text NOT NULL,
  content_type text NOT NULL, bytes integer NOT NULL CHECK(bytes>0 AND bytes<10000000),
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
  finalized_asset_id uuid REFERENCES sc_assets(id), storage_deleted_at timestamptz
);
CREATE TABLE sc_jobs (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES sc_projects(id) ON DELETE CASCADE, owner_id text NOT NULL,
  look_id text NOT NULL, mode text NOT NULL CHECK(mode IN ('live','recorded')), command_id text NOT NULL,
  request_hash text NOT NULL, input_hash text NOT NULL, input jsonb NOT NULL,
  state text NOT NULL CHECK(state IN ('queued','preparing','submitting','ambiguous','polling','storing','succeeded','failed','cancelled')),
  message text NOT NULL, estimated_units integer NOT NULL DEFAULT 2,
  provider_task_id text, workflow_run_id text, submission_started_at timestamptz,
  dispatch_started_at timestamptz, cancel_requested boolean NOT NULL DEFAULT false,
  output_asset_id uuid REFERENCES sc_assets(id), result_preview_id text,
  error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,command_id)
);
CREATE INDEX sc_jobs_state ON sc_jobs(state,updated_at);
CREATE INDEX sc_jobs_quota ON sc_jobs(created_at,owner_id) WHERE mode='live';
CREATE TABLE sc_provider_files (
  job_id uuid NOT NULL REFERENCES sc_jobs(id) ON DELETE CASCADE, role text NOT NULL CHECK(role IN ('source','garment')),
  state text NOT NULL CHECK(state IN ('intent','registered','uploading','uploaded','failed')),
  registration_started_at timestamptz, file_id text, upload_request jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(job_id,role)
);
CREATE TABLE sc_script_drafts (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES sc_projects(id) ON DELETE CASCADE,
  owner_id text NOT NULL, command_id text NOT NULL, base_revision integer NOT NULL,
  input_hash text NOT NULL, status text NOT NULL CHECK(status IN ('extracting','review','adopted','failed')),
  draft jsonb, error_code text, created_at timestamptz NOT NULL DEFAULT now(), adopted_at timestamptz,
  UNIQUE(project_id,command_id)
);
CREATE TABLE sc_rate_windows (key text NOT NULL, window_start timestamptz NOT NULL, count integer NOT NULL, PRIMARY KEY(key,window_start));
CREATE TABLE sc_provider_requests (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
