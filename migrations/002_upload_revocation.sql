-- Retain the original token deadline so a revoked upload cannot be recreated
-- after its first cleanup pass and then become an untracked private orphan.
ALTER TABLE sc_upload_intents ADD COLUMN revoked_at timestamptz;
