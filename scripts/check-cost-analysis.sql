-- Check daily API call volume and costs
-- Run this on production database to understand the 420 NIS spike

-- 1. Check if ai_cost_log table exists
SELECT EXISTS (
   SELECT FROM information_schema.tables
   WHERE table_name = 'ai_cost_log'
);

-- 2. Get today's total costs by model
SELECT
  model,
  COUNT(*) as call_count,
  SUM(cost_usd) as total_cost_usd,
  AVG(cost_usd) as avg_cost_per_call,
  SUM(tokens_used) as total_tokens
FROM ai_cost_log
WHERE created_at >= CURRENT_DATE
GROUP BY model
ORDER BY total_cost_usd DESC;

-- 3. Get yesterday's costs (for the 420 NIS spike)
SELECT
  model,
  COUNT(*) as call_count,
  SUM(cost_usd) as total_cost_usd,
  AVG(cost_usd) as avg_cost_per_call,
  SUM(tokens_used) as total_tokens
FROM ai_cost_log
WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
  AND created_at < CURRENT_DATE
GROUP BY model
ORDER BY total_cost_usd DESC;

-- 4. Hourly breakdown for yesterday (find spikes)
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  model,
  COUNT(*) as call_count,
  SUM(cost_usd) as total_cost
FROM ai_cost_log
WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
  AND created_at < CURRENT_DATE
GROUP BY DATE_TRUNC('hour', created_at), model
ORDER BY hour DESC, total_cost DESC;

-- 5. Check for suspicious patterns (same user making many calls)
SELECT
  user_id,
  model,
  COUNT(*) as call_count,
  SUM(cost_usd) as total_cost
FROM ai_cost_log
WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
  AND created_at < CURRENT_DATE
GROUP BY user_id, model
HAVING COUNT(*) > 50  -- More than 50 calls per day is suspicious
ORDER BY call_count DESC;

-- 6. Check for operations causing high costs
SELECT
  operation,
  model,
  COUNT(*) as call_count,
  SUM(cost_usd) as total_cost
FROM ai_cost_log
WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
  AND created_at < CURRENT_DATE
GROUP BY operation, model
ORDER BY total_cost DESC;

-- 7. Get monthly total to compare with projection
SELECT
  SUM(cost_usd) as total_cost_usd,
  COUNT(*) as total_calls,
  SUM(cost_usd) * 3.65 as estimated_nis  -- USD to NIS conversion (approximate)
FROM ai_cost_log
WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE);
