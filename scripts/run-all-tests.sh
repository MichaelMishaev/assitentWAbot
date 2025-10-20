#!/bin/bash
# Run all tests (FREE tools only!)
# No paid services required

set -e

echo "🧪 Running All WhatsApp Bot Tests (FREE Edition)"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

run_test() {
  local name=$1
  local command=$2

  echo -e "${BLUE}▶ Running: ${name}${NC}"
  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if eval $command; then
    echo -e "${GREEN}✅ PASS: ${name}${NC}\n"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}❌ FAIL: ${name}${NC}\n"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

# 1. Unit Tests (Jest)
echo -e "${YELLOW}📦 Category 1: Unit Tests${NC}"
run_test "Unit Tests" "npm run test:unit"

# 2. Integration Tests (Jest)
echo -e "${YELLOW}📦 Category 2: Integration Tests${NC}"
run_test "Integration Tests" "npm run test:integration"

# 3. Bug Regression Tests
echo -e "${YELLOW}📦 Category 3: Bug Regression Tests${NC}"
run_test "Bug-Specific Tests" "npm run test:bugs"

# 4. NLP Tests
echo -e "${YELLOW}📦 Category 4: NLP Classification Tests${NC}"
run_test "NLP Service Tests" "npm run test:nlp"

# 5. Hebrew-specific Tests
echo -e "${YELLOW}📦 Category 5: Hebrew Language Tests${NC}"
run_test "Hebrew QA Tests" "npm run test:hebrew-qa"

# 6. Conversation Flow Tests (Botium)
echo -e "${YELLOW}📦 Category 6: Conversation Flow Tests (Botium)${NC}"
run_test "Botium Conversations" "npm run test:conversations"

# 7. Message Simulator Tests
echo -e "${YELLOW}📦 Category 7: Message Flow Simulation${NC}"
run_test "Message Simulator" "npm run test:simulator"

# 8. Playwright UI Tests (Dashboard)
echo -e "${YELLOW}📦 Category 8: Dashboard UI Tests (Playwright)${NC}"
run_test "Playwright Tests" "npm run test:playwright"

# Summary
echo ""
echo "================================================"
echo -e "${BLUE}📊 Test Summary${NC}"
echo "================================================"
echo -e "Total Tests Run:  ${TOTAL_TESTS}"
echo -e "Passed:           ${GREEN}${PASSED_TESTS}${NC}"
echo -e "Failed:           ${RED}${FAILED_TESTS}${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "\n${GREEN}🎉 All tests passed!${NC}"
  exit 0
else
  PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED_TESTS / $TOTAL_TESTS) * 100}")
  echo -e "\n${RED}⚠️  Some tests failed${NC}"
  echo -e "Pass Rate: ${PASS_RATE}%"
  exit 1
fi
