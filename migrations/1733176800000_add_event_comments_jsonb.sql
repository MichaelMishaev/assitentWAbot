-- Migration: Add Event Comments as JSONB
-- Created: 2025-10-04
-- Description: Convert events.notes from TEXT to JSONB array for structured comments

-- ============================================================================
-- FORWARD MIGRATION
-- ============================================================================

-- Step 1: Add temporary JSONB column
ALTER TABLE events ADD COLUMN notes_jsonb JSONB DEFAULT '[]'::jsonb;

-- Step 2: Migrate existing TEXT notes to JSONB array
-- If notes exist, convert to first comment with metadata
UPDATE events
SET notes_jsonb = CASE
  -- Empty or NULL → empty array
  WHEN notes IS NULL OR TRIM(notes) = '' THEN '[]'::jsonb

  -- Has text → convert to first comment object
  ELSE jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'text', notes,
      'timestamp', COALESCE(created_at, CURRENT_TIMESTAMP)::text,
      'priority', 'normal',
      'tags', '[]'::jsonb
    )
  )
END;

-- Step 3: Verify migration (optional check)
DO $$
DECLARE
  old_count INTEGER;
  new_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO old_count FROM events WHERE notes IS NOT NULL AND TRIM(notes) != '';
  SELECT COUNT(*) INTO new_count FROM events WHERE jsonb_array_length(notes_jsonb) > 0;

  IF old_count != new_count THEN
    RAISE EXCEPTION 'Migration verification failed: % old notes != % new comments', old_count, new_count;
  END IF;

  RAISE NOTICE 'Migration verified: % events with notes converted successfully', new_count;
END $$;

-- Step 4: Drop old TEXT column
ALTER TABLE events DROP COLUMN notes;

-- Step 5: Rename JSONB column to 'notes'
ALTER TABLE events RENAME COLUMN notes_jsonb TO notes;

-- Step 6: Add GIN index for faster JSONB queries
-- GIN index allows fast searching within JSONB arrays
CREATE INDEX idx_events_notes_gin ON events USING GIN (notes);

-- Step 7: Add check constraint (optional - ensures valid structure)
ALTER TABLE events ADD CONSTRAINT notes_is_array
  CHECK (jsonb_typeof(notes) = 'array');

-- Add comments for documentation
COMMENT ON COLUMN events.notes IS 'Event comments as JSONB array with structure: [{id, text, timestamp, priority, tags, reminderId?}]';

-- ============================================================================
-- ROLLBACK MIGRATION (if needed)
-- ============================================================================

-- To rollback this migration, run:
--
-- ALTER TABLE events ADD COLUMN notes_text TEXT;
--
-- UPDATE events
-- SET notes_text = CASE
--   WHEN jsonb_array_length(notes) = 0 THEN NULL
--   ELSE notes->0->>'text'
-- END;
--
-- ALTER TABLE events DROP CONSTRAINT notes_is_array;
-- DROP INDEX idx_events_notes_gin;
-- ALTER TABLE events DROP COLUMN notes;
-- ALTER TABLE events RENAME COLUMN notes_text TO notes;
