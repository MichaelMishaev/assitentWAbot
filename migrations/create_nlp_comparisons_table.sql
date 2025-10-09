-- Migration: Create NLP comparisons table for A/B testing GPT vs Gemini
-- Created: 2025-10-10

CREATE TABLE IF NOT EXISTS nlp_comparisons (
  id SERIAL PRIMARY KEY,
  user_message TEXT NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  gpt_intent JSONB NOT NULL,
  gemini_intent JSONB NOT NULL,
  gpt_response_time INTEGER NOT NULL, -- milliseconds
  gemini_response_time INTEGER NOT NULL, -- milliseconds
  intent_match BOOLEAN NOT NULL,
  confidence_diff DECIMAL(5,4) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_nlp_comparisons_user_id ON nlp_comparisons(user_id);
CREATE INDEX IF NOT EXISTS idx_nlp_comparisons_created_at ON nlp_comparisons(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nlp_comparisons_intent_match ON nlp_comparisons(intent_match);

-- Comments
COMMENT ON TABLE nlp_comparisons IS 'Stores side-by-side comparisons of GPT vs Gemini NLP parsing for A/B testing';
COMMENT ON COLUMN nlp_comparisons.gpt_intent IS 'Full GPT response JSON';
COMMENT ON COLUMN nlp_comparisons.gemini_intent IS 'Full Gemini response JSON';
COMMENT ON COLUMN nlp_comparisons.intent_match IS 'TRUE if both providers returned same intent';
COMMENT ON COLUMN nlp_comparisons.confidence_diff IS 'Absolute difference in confidence scores';
