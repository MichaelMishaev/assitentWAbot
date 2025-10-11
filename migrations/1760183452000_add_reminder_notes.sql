-- Add notes field to reminders table
-- Migration: 1760183452000_add_reminder_notes
-- Purpose: Allow users to add notes/descriptions to reminders (same as events)

-- Add notes column to reminders table
ALTER TABLE reminders
ADD COLUMN notes TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN reminders.notes IS 'Optional notes/description for the reminder';

-- Index for text search (if needed in future)
-- CREATE INDEX idx_reminders_notes_search ON reminders USING gin(to_tsvector('english', notes));
