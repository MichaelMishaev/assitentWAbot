-- Migration: Add Cost Tracking Table
-- Purpose: Track AI API costs for monitoring and alerts
-- Created: 2025-10-12

-- Create ai_cost_log table
CREATE TABLE IF NOT EXISTS ai_cost_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  operation TEXT NOT NULL,
  cost_usd NUMERIC(10, 6) NOT NULL,
  tokens_used INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cost_log_user_id ON ai_cost_log(user_id);
CREATE INDEX IF NOT EXISTS idx_cost_log_created_at ON ai_cost_log(created_at);
CREATE INDEX IF NOT EXISTS idx_cost_log_model ON ai_cost_log(model);
CREATE INDEX IF NOT EXISTS idx_cost_log_month ON ai_cost_log(DATE_TRUNC('month', created_at));

-- Comments
COMMENT ON TABLE ai_cost_log IS 'Tracks AI API costs for monitoring and budgeting';
COMMENT ON COLUMN ai_cost_log.cost_usd IS 'Cost in USD (up to 6 decimal places for precision)';
COMMENT ON COLUMN ai_cost_log.tokens_used IS 'Total tokens (input + output) for this API call';
COMMENT ON COLUMN ai_cost_log.operation IS 'Type of operation (e.g., intent-detection, entity-extraction)';
