/**
 * Migration: Add Event Participants
 *
 * Adds support for multi-participant events:
 * - "פגישה עם דוד ומשה"
 * - "קולנוע עם המשפחה"
 *
 * Stores participants with their role (primary/companion)
 */

-- Create event_participants table
CREATE TABLE IF NOT EXISTS event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('primary', 'companion')),
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(event_id, name)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_participants_event_id ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_participants_name ON event_participants(name);

-- Add comments
COMMENT ON TABLE event_participants IS 'Participants in events (for multi-person events)';
COMMENT ON COLUMN event_participants.role IS 'primary = main contact, companion = additional participant';
COMMENT ON COLUMN event_participants.phone IS 'Optional phone number if extracted from message';
