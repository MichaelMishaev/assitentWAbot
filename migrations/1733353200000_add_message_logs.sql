-- Migration: Add message_logs table for analytics and debugging
-- Created: 2025-10-05

-- Create message_logs table
CREATE TABLE IF NOT EXISTS message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('incoming', 'outgoing')),
  content TEXT NOT NULL,
  intent VARCHAR(100),
  conversation_state VARCHAR(100),
  confidence DECIMAL(3,2),
  processing_time INTEGER, -- milliseconds
  has_error BOOLEAN DEFAULT false,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_message_logs_user_id ON message_logs(user_id);
CREATE INDEX idx_message_logs_phone ON message_logs(phone);
CREATE INDEX idx_message_logs_created_at ON message_logs(created_at DESC);
CREATE INDEX idx_message_logs_message_type ON message_logs(message_type);
CREATE INDEX idx_message_logs_intent ON message_logs(intent) WHERE intent IS NOT NULL;
CREATE INDEX idx_message_logs_state ON message_logs(conversation_state) WHERE conversation_state IS NOT NULL;
CREATE INDEX idx_message_logs_errors ON message_logs(user_id, has_error) WHERE has_error = true;
CREATE INDEX idx_message_logs_content_search ON message_logs USING gin(to_tsvector('english', content));

-- Add comment
COMMENT ON TABLE message_logs IS 'Logs all messages for analytics, debugging, and user conversation history';
COMMENT ON COLUMN message_logs.message_type IS 'Type of message: incoming (from user) or outgoing (from bot)';
COMMENT ON COLUMN message_logs.intent IS 'NLP detected intent for incoming messages';
COMMENT ON COLUMN message_logs.conversation_state IS 'Current conversation state when message was processed';
COMMENT ON COLUMN message_logs.confidence IS 'NLP confidence score (0.00 to 1.00)';
COMMENT ON COLUMN message_logs.processing_time IS 'Time taken to process message in milliseconds';
COMMENT ON COLUMN message_logs.metadata IS 'Additional metadata as JSON (entities, context, etc)';
