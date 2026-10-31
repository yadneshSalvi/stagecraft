ALTER TABLE sc_quota_reservations ADD COLUMN released boolean NOT NULL DEFAULT false;
ALTER TABLE sc_quota_reservations ADD COLUMN released_at timestamptz;
CREATE TABLE sc_provider_credit_balances (
  account_key text PRIMARY KEY CHECK(account_key ~ '^[a-f0-9]{64}$'),
  balance double precision CHECK(balance >= 0),
  checked_at timestamptz NOT NULL
);

-- Release only after the job is terminal and no paid submission could have begun.
-- A timeout/ambiguous POST remains reserved, even if the task ID is unknown.
CREATE FUNCTION sc_release_unused_preview_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mode='live' AND NEW.state IN ('failed','cancelled')
     AND NEW.submission_started_at IS NULL AND NEW.provider_task_id IS NULL THEN
    UPDATE sc_quota_reservations SET released=true,released_at=COALESCE(released_at,now())
    WHERE id=NEW.id AND NOT released;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sc_release_unused_preview_reservation
AFTER UPDATE OF state ON sc_jobs FOR EACH ROW
EXECUTE FUNCTION sc_release_unused_preview_reservation();
UPDATE sc_quota_reservations q SET released=true,released_at=now()
FROM sc_jobs j WHERE j.id=q.id AND j.mode='live' AND j.state IN ('failed','cancelled')
AND j.submission_started_at IS NULL AND j.provider_task_id IS NULL;
