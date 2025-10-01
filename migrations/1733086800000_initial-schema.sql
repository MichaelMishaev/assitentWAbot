-- Initial database schema for WhatsApp Assistant Bot
-- Migration: 1733086800000_initial-schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    username VARCHAR(100),
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    locale VARCHAR(5) DEFAULT 'he',
    timezone VARCHAR(50) DEFAULT 'Asia/Jerusalem',
    prefs_jsonb JSONB DEFAULT '{}',
    calendar_provider VARCHAR(20) DEFAULT 'LOCAL',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on phone for faster lookups
CREATE INDEX idx_users_phone ON users(phone);

-- Contacts table
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    relation VARCHAR(50),
    aliases TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on user_id for faster lookups
CREATE INDEX idx_contacts_user_id ON contacts(user_id);

-- Events table
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    start_ts_utc TIMESTAMP NOT NULL,
    end_ts_utc TIMESTAMP,
    rrule VARCHAR(255),
    location VARCHAR(500),
    notes TEXT,
    source VARCHAR(50) DEFAULT 'manual',
    confidence DECIMAL(3,2),
    external_ref_jsonb JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for event queries
CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_start_ts ON events(start_ts_utc);
CREATE INDEX idx_events_user_start ON events(user_id, start_ts_utc);

-- Reminders table
CREATE TABLE reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    due_ts_utc TIMESTAMP NOT NULL,
    rrule VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    external_ref_jsonb JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for reminder queries
CREATE INDEX idx_reminders_user_id ON reminders(user_id);
CREATE INDEX idx_reminders_due_ts ON reminders(due_ts_utc);
CREATE INDEX idx_reminders_status ON reminders(status);
CREATE INDEX idx_reminders_user_due ON reminders(user_id, due_ts_utc);

-- Sessions table (for conversation state)
CREATE TABLE sessions (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    state VARCHAR(100) NOT NULL DEFAULT 'IDLE',
    context JSONB DEFAULT '{}',
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

-- Create index on expires_at for cleanup
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reminders_updated_at BEFORE UPDATE ON reminders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE users IS 'WhatsApp users of the bot';
COMMENT ON TABLE contacts IS 'User contacts for invites and mentions';
COMMENT ON TABLE events IS 'Calendar events';
COMMENT ON TABLE reminders IS 'Scheduled reminders';
COMMENT ON TABLE sessions IS 'Conversation state (replicated from Redis)';

COMMENT ON COLUMN users.phone IS 'WhatsApp phone number (international format)';
COMMENT ON COLUMN users.password_hash IS 'bcrypt hash of 4-digit PIN';
COMMENT ON COLUMN users.prefs_jsonb IS 'User preferences (JSON)';
COMMENT ON COLUMN events.rrule IS 'Recurrence rule (RFC 5545 format)';
COMMENT ON COLUMN reminders.status IS 'active, sent, cancelled, failed';
