-- Source-only hair and source/reference necklace jobs share the existing
-- guarded submission/file/credit ledgers and independent face permission.
ALTER TABLE sc_jobs DROP CONSTRAINT sc_jobs_kind_check;
ALTER TABLE sc_jobs ADD CONSTRAINT sc_jobs_kind_check
CHECK(kind IN ('garment','beauty','hair_color','necklace'));
