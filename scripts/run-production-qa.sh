#!/bin/bash
# Production QA - Long Conversation Tests
# Run this ONLY when user says to test production!

set -e

echo "🚨 PRODUCTION QA TEST RUNNER"
echo "════════════════════════════════════════════════════════════"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if production flag is set
if [ "$1" != "--production" ]; then
  echo -e "${RED}⚠️  WARNING: This will test PRODUCTION!${NC}"
  echo ""
  echo "Usage: $0 --production [phone_number]"
  echo ""
  echo "Example:"
  echo "  $0 --production +972501234567"
  echo ""
  echo "This will send REAL messages to production WhatsApp bot!"
  exit 1
fi

PRODUCTION_PHONE=$2

if [ -z "$PRODUCTION_PHONE" ]; then
  echo -e "${RED}❌ Error: Production phone number required${NC}"
  echo ""
  echo "Usage: $0 --production [phone_number]"
  exit 1
fi

echo -e "${YELLOW}📱 Target Production Phone: ${PRODUCTION_PHONE}${NC}"
echo -e "${YELLOW}🌐 Production Server: 167.71.145.9${NC}"
echo ""

# Confirm
echo -e "${RED}⚠️  THIS WILL SEND REAL MESSAGES TO PRODUCTION!${NC}"
echo ""
read -p "Are you ABSOLUTELY SURE? Type 'YES' to continue: " -r
echo ""

if [[ ! $REPLY == "YES" ]]; then
  echo "❌ Cancelled"
  exit 1
fi

echo ""
echo -e "${BLUE}🚀 Starting Production QA Tests...${NC}"
echo "════════════════════════════════════════════════════════════"
echo ""

# Test counter
TOTAL_TESTS=5
PASSED_TESTS=0
FAILED_TESTS=0

# Test 1: Long Conversation - Event Lifecycle
echo -e "${BLUE}Test 1/${TOTAL_TESTS}: Event Lifecycle (10 turns)${NC}"
if npm run test:conversations -- long-conversation-01-event-lifecycle.convo.txt; then
  echo -e "${GREEN}✅ PASS${NC}"
  PASSED_TESTS=$((PASSED_TESTS + 1))
else
  echo -e "${RED}❌ FAIL${NC}"
  FAILED_TESTS=$((FAILED_TESTS + 1))
fi
echo ""

# Test 2: Context Retention
echo -e "${BLUE}Test 2/${TOTAL_TESTS}: Context Retention (15 turns)${NC}"
if npm run test:conversations -- long-conversation-02-context-retention.convo.txt; then
  echo -e "${GREEN}✅ PASS${NC}"
  PASSED_TESTS=$((PASSED_TESTS + 1))
else
  echo -e "${RED}❌ FAIL${NC}"
  FAILED_TESTS=$((FAILED_TESTS + 1))
fi
echo ""

# Test 3: Multi-Topic Switching
echo -e "${BLUE}Test 3/${TOTAL_TESTS}: Multi-Topic Switching (12 turns)${NC}"
if npm run test:conversations -- long-conversation-03-multi-topic.convo.txt; then
  echo -e "${GREEN}✅ PASS${NC}"
  PASSED_TESTS=$((PASSED_TESTS + 1))
else
  echo -e "${RED}❌ FAIL${NC}"
  FAILED_TESTS=$((FAILED_TESTS + 1))
fi
echo ""

# Test 4: Edge Cases
echo -e "${BLUE}Test 4/${TOTAL_TESTS}: Edge Cases & Error Handling (10 turns)${NC}"
if npm run test:conversations -- long-conversation-04-edge-cases.convo.txt; then
  echo -e "${GREEN}✅ PASS${NC}"
  PASSED_TESTS=$((PASSED_TESTS + 1))
else
  echo -e "${RED}❌ FAIL${NC}"
  FAILED_TESTS=$((FAILED_TESTS + 1))
fi
echo ""

# Test 5: Stress Test
echo -e "${BLUE}Test 5/${TOTAL_TESTS}: Stress Test (20 turns)${NC}"
if npm run test:conversations -- long-conversation-05-stress-test.convo.txt; then
  echo -e "${GREEN}✅ PASS${NC}"
  PASSED_TESTS=$((PASSED_TESTS + 1))
else
  echo -e "${RED}❌ FAIL${NC}"
  FAILED_TESTS=$((FAILED_TESTS + 1))
fi
echo ""

# Summary
echo "════════════════════════════════════════════════════════════"
echo -e "${BLUE}📊 PRODUCTION QA RESULTS${NC}"
echo "════════════════════════════════════════════════════════════"
echo -e "Total Tests: ${TOTAL_TESTS}"
echo -e "Passed: ${GREEN}${PASSED_TESTS}${NC}"
echo -e "Failed: ${RED}${FAILED_TESTS}${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}🎉 All production tests passed!${NC}"
  exit 0
else
  PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED_TESTS / $TOTAL_TESTS) * 100}")
  echo -e "${RED}⚠️  Some tests failed${NC}"
  echo -e "Pass Rate: ${PASS_RATE}%"
  exit 1
fi
