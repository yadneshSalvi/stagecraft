-- Spend reservations outlive project deletion. Deleting a project must never
-- refill the account's or the browser owner's daily paid-generation allowance.
CREATE TABLE sc_quota_reservations (
  id uuid PRIMARY KEY, owner_id text NOT NULL, project_id uuid NOT NULL,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  estimated_units integer NOT NULL CHECK(estimated_units>0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sc_quota_day ON sc_quota_reservations(day,owner_id);
INSERT INTO sc_quota_reservations(id,owner_id,project_id,day,estimated_units,created_at)
SELECT id,owner_id,project_id,(created_at AT TIME ZONE 'UTC')::date,estimated_units,created_at FROM sc_jobs WHERE mode='live'
ON CONFLICT DO NOTHING;
