-- Independent close-up face consent and beauty jobs share the durable ledger,
-- while legacy rows remain garment jobs without changing their input hashes.
ALTER TABLE sc_jobs ADD COLUMN kind text NOT NULL DEFAULT 'garment' CHECK(kind IN ('garment','beauty'));
ALTER TABLE sc_assets DROP CONSTRAINT sc_assets_purpose_check;
ALTER TABLE sc_assets ADD CONSTRAINT sc_assets_purpose_check CHECK(purpose IN ('performer','garment','preview','face','beauty_preview'));
ALTER TABLE sc_upload_intents DROP CONSTRAINT sc_upload_intents_purpose_check;
ALTER TABLE sc_upload_intents ADD CONSTRAINT sc_upload_intents_purpose_check CHECK(purpose IN ('performer','garment','face'));
