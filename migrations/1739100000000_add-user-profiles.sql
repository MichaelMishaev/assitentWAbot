/**
 * Migration: Add User Profiles
 *
 * Adds fields to users table for smart defaults and pattern learning:
 * - default_location: Preferred location for events
 * - patterns_jsonb: Learned patterns (common times, locations, etc.)
 * - preferred_time_of_day: Morning/afternoon/evening preference
 * - default_event_duration: Default duration in minutes
 */

-- Add user profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_location TEXT DEFAULT 'jerusalem';
ALTER TABLE users ADD COLUMN IF NOT EXISTS patterns_jsonb JSONB DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_time_of_day TEXT CHECK (preferred_time_of_day IN ('morning', 'afternoon', 'evening', NULL));
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_event_duration INT DEFAULT 60; -- minutes

-- Create index for pattern queries
CREATE INDEX IF NOT EXISTS idx_users_patterns ON users USING GIN (patterns_jsonb);

-- Update existing users with default values
UPDATE users
SET
  default_location = 'jerusalem',
  patterns_jsonb = '{}'::jsonb,
  default_event_duration = 60
WHERE
  default_location IS NULL
  OR patterns_jsonb IS NULL
  OR default_event_duration IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN users.default_location IS 'Default location for Hebrew calendar (jerusalem, telaviv, haifa, beersheba, eilat, netanya)';
COMMENT ON COLUMN users.patterns_jsonb IS 'Learned user patterns: {common_times: [], common_locations: [], common_titles: [], avg_duration: 60}';
COMMENT ON COLUMN users.preferred_time_of_day IS 'User preference for event timing (morning=8-12, afternoon=12-17, evening=17-21)';
COMMENT ON COLUMN users.default_event_duration IS 'Default event duration in minutes when not specified';
