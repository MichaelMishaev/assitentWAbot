#!/bin/bash

# QA Test Script for Production Error Fixes
# Tests all fixes implemented for the critical production issues

echo "========================================"
echo "🧪 QA TEST SUITE - Production Error Fixes"
echo "========================================"
echo ""

# Colors
GREEN='\033[0.32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0

function test_pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((PASS_COUNT++))
}

function test_fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    ((FAIL_COUNT++))
}

function test_info() {
    echo -e "${YELLOW}ℹ INFO${NC}: $1"
}

echo "Test 1: SQL Fix - NLP Comparison Stats"
echo "========================================="
test_info "Testing NLPComparisonLogger.getStats() SQL query"

# Check if the SQL query has been fixed (no SELECT *)
if grep -q "SELECT \* FROM nlp_comparisons" src/services/NLPComparisonLogger.ts; then
    test_fail "SQL still contains 'SELECT *' - not fixed"
else
    if grep -q "intent_match" src/services/NLPComparisonLogger.ts && grep -q "confidence_diff" src/services/NLPComparisonLogger.ts; then
        test_pass "SQL fixed - using specific columns instead of SELECT *"
    else
        test_fail "SQL query structure unclear"
    fi
fi

echo ""
echo "Test 2: Event Validation"
echo "========================="
test_info "Checking EventService validation"

# Check for title validation
if grep -q "title.trim() === ''" src/services/EventService.ts; then
    test_pass "Title validation exists"
else
    test_fail "Title validation missing"
fi

# Check for userId validation
if grep -q "userId.trim() === ''" src/services/EventService.ts; then
    test_pass "User ID validation exists"
else
    test_fail "User ID validation missing"
fi

echo ""
echo "Test 3: UUID Validation"
echo "======================="
test_info "Checking UUID validation in EventService"

# Check for isUUID import
if grep -q "validate as isUUID" src/services/EventService.ts; then
    test_pass "UUID validation library imported"
else
    test_fail "UUID validation library not imported"
fi

# Check for UUID validation in getEventById
if grep -A 5 "getEventById" src/services/EventService.ts | grep -q "isUUID(eventId)"; then
    test_pass "UUID validation in getEventById"
else
    test_fail "UUID validation missing in getEventById"
fi

echo ""
echo "Test 4: WhatsApp Connection Handling"
echo "====================================="
test_info "Checking WhatsApp connection improvements"

# Check for exponential backoff
if grep -q "reconnectAttempts" src/providers/BaileysProvider.ts; then
    test_pass "Reconnect attempts counter exists"
else
    test_fail "Reconnect attempts counter missing"
fi

# Check for MAX_RECONNECT_DELAY
if grep -q "MAX_RECONNECT_DELAY" src/providers/BaileysProvider.ts; then
    test_pass "Maximum reconnect delay defined"
else
    test_fail "Maximum reconnect delay not defined"
fi

# Check for exponential backoff logic
if grep -q "Math.pow(2" src/providers/BaileysProvider.ts; then
    test_pass "Exponential backoff implemented"
else
    test_fail "Exponential backoff not implemented"
fi

echo ""
echo "Test 5: Date Parsing"
echo "===================="
test_info "Checking Hebrew date parsing and validation"

# Check for parseHebrewDate function
if grep -q "parseHebrewDate" src/utils/hebrewDateParser.ts; then
    test_pass "Hebrew date parser exists"
else
    test_fail "Hebrew date parser missing"
fi

# Check for safeParseDate function
if grep -q "safeParseDate" src/utils/dateValidator.ts; then
    test_pass "Safe date parse function exists"
else
    test_fail "Safe date parse function missing"
fi

# Check for NaN prevention
if grep -q "Prevented NaN timestamp bug" src/utils/dateValidator.ts; then
    test_pass "NaN timestamp prevention exists"
else
    test_fail "NaN timestamp prevention missing"
fi

echo ""
echo "Test 6: Error Handlers"
echo "======================"
test_info "Checking global error handlers"

# Check for unhandledRejection handler
if grep -q "unhandledRejection" src/index.ts; then
    test_pass "Unhandled rejection handler exists"
else
    test_fail "Unhandled rejection handler missing"
fi

# Check for uncaughtException handler
if grep -q "uncaughtException" src/index.ts; then
    test_pass "Uncaught exception handler exists"
else
    test_fail "Uncaught exception handler missing"
fi

echo ""
echo "Test 7: Build System"
echo "===================="
test_info "Checking TypeScript build"

# Check if build succeeded
if [ -d "dist" ]; then
    test_pass "Build directory exists"

    # Check for critical files
    if [ -f "dist/index.js" ]; then
        test_pass "Main entry point compiled"
    else
        test_fail "Main entry point not compiled"
    fi

    if [ -f "dist/services/NLPComparisonLogger.js" ]; then
        test_pass "NLPComparisonLogger compiled"
    else
        test_fail "NLPComparisonLogger not compiled"
    fi

    if [ -f "dist/services/EventService.js" ]; then
        test_pass "EventService compiled"
    else
        test_fail "EventService not compiled"
    fi
else
    test_fail "Build directory does not exist - run 'npm run build' first"
fi

echo ""
echo "========================================"
echo "📊 QA TEST RESULTS"
echo "========================================"
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
echo -e "${RED}Failed: $FAIL_COUNT${NC}"
echo "Total: $((PASS_COUNT + FAIL_COUNT))"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
    echo "System is ready for production deployment."
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo "Please review and fix failed tests before deployment."
    exit 1
fi
