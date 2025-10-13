#!/bin/bash
# Check local evidence of the cost spike

echo "========================================="
echo "LOCAL EVIDENCE INVESTIGATION"
echo "========================================="
echo ""

cd /Users/michaelmishayev/Desktop/Projects/wAssitenceBot

echo "1. Checking for recent local logs..."
if [ -d "logs" ]; then
    echo "📁 Found logs directory:"
    ls -lh logs/ 2>/dev/null | tail -10
    echo ""

    echo "📊 Recent log entries with AI calls:"
    find logs -type f -name "*.log" -mtime -2 -exec grep -h "Ensemble\|Gemini\|GPT\|Claude" {} \; 2>/dev/null | tail -50
else
    echo "❌ No logs directory found locally"
fi

echo ""
echo "2. Checking Git history for recent deployments..."
git log --oneline --since="2 days ago" | head -10

echo ""
echo "3. Checking .env for API keys (redacted)..."
if [ -f ".env" ]; then
    echo "✅ .env exists"
    echo "GEMINI_API_KEY: $(grep GEMINI_API_KEY .env | sed 's/=.*/=***REDACTED***/')"
    echo "OPENAI_API_KEY: $(grep OPENAI_API_KEY .env | sed 's/=.*/=***REDACTED***/')"
    echo "ANTHROPIC_API_KEY: $(grep ANTHROPIC_API_KEY .env | sed 's/=.*/=***REDACTED***/')"
else
    echo "❌ .env not found"
fi

echo ""
echo "4. Checking if message loop protection exists..."
echo "Checking isFromMe filter in dist/index.js:"
if [ -f "dist/index.js" ]; then
    grep -A 3 "isFromMe" dist/index.js | head -10
else
    echo "❌ dist/index.js not found"
fi

echo ""
echo "5. Checking EnsembleClassifier for AI model usage..."
if [ -f "dist/domain/phases/phase1-intent/EnsembleClassifier.js" ]; then
    echo "✅ EnsembleClassifier exists"
    echo "Models being called:"
    grep -E "classifyWith" dist/domain/phases/phase1-intent/EnsembleClassifier.js | head -10
else
    echo "❌ EnsembleClassifier not found in dist"
fi

echo ""
echo "6. Analyzing source code for potential issues..."
echo ""
echo "📌 Checking for rate limiting:"
grep -r "rate.*limit\|msg:count" src/ --include="*.ts" | head -5
if [ $? -ne 0 ]; then
    echo "❌ NO RATE LIMITING FOUND!"
fi

echo ""
echo "📌 Checking for cost tracking in Gemini:"
grep -A 5 "generateContent" src/services/GeminiNLPService.ts | head -15

echo ""
echo "📌 Checking for cost tracking in GPT:"
grep -A 5 "chat.completions.create" src/services/NLPService.ts | head -15

echo ""
echo "7. Checking package.json for AI dependencies..."
grep -E "gemini|openai|anthropic" package.json

echo ""
echo "========================================="
echo "LOCAL INVESTIGATION COMPLETE"
echo "========================================="
echo ""
echo "🔍 Key Findings Summary:"
echo "   - Check if rate limiting exists (should see msg:count or rate limit code)"
echo "   - Check if cost tracking exists after generateContent"
echo "   - Check if isFromMe protection is in place"
echo ""
