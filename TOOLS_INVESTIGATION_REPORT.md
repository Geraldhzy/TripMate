# AI Travel Planner - Flight & Hotel Search Tools Investigation Report

## Executive Summary

I've completed a comprehensive investigation into the flight search and hotel search tools. The investigation reveals **TWO CRITICAL ISSUES**:

1. **Playwright Dependency Missing** (Blocks Hotel Search) - The hotel search tool requires Playwright which is not installed
2. **Code Refactoring Impact** (Potential Risk for Flight Search) - Recent server.js refactoring may have architectural issues

---

## 1. FLIGHT SEARCH TOOL STATUS ✅ FUNCTIONAL

### Tool Definition: `/tools/flight-search.js`

**Status**: ✅ **WORKS** (tested and verified)

**How it works**:
- Spawns Python process with `search_flights.py` script
- Uses `fast-flights` library (v2.2 installed ✅)
- Accepts: `origin` (IATA), `destination` (IATA), `date` (YYYY-MM-DD), `passengers`
- Returns: JSON with flight details, prices in USD, airline info, duration, stops

**Test Result**:
```
Command: echo '{"origin":"MFM","destination":"KUL","date":"2026-04-20","passengers":1}' | python3 tools/scripts/search_flights.py

Output: ✅ SUCCESS - Returned 13 flight options with prices, airlines, durations
```

**Python Script** (`/tools/scripts/search_flights.py`):
- Uses `fast-flights` library with multiple fallback modes (common, fallback, force-fallback)
- Robust error handling and deduplication
- Handles "Price unavailable" gracefully
- Well-structured JSON output

**Dependencies**:
- ✅ `fast-flights` (v2.2) - INSTALLED
- ✅ Python3 - AVAILABLE

---

## 2. HOTEL SEARCH TOOL STATUS ❌ BROKEN

### Tool Definition: `/tools/hotel-search.js`

**Status**: ❌ **BROKEN** - Missing critical dependency

**How it works**:
- Spawns Python process with `search_hotels.py` script
- Uses `playwright` library with Chromium browser
- Scrapes Google Hotels for hotel prices
- Accepts: `city`, `checkin` (YYYY-MM-DD), `checkout` (YYYY-MM-DD)
- Returns: JSON with hotel names, prices, ratings

**Test Result**:
```
Command: echo '{"city":"Kuala Lumpur","checkin":"2026-04-20","checkout":"2026-04-22"}' | python3 tools/scripts/search_hotels.py

Output: ❌ ERROR
{
  "error": "playwright 未安装，请运行: pip3 install playwright && playwright install chromium"
}
```

**Root Cause**:
- **Playwright not installed** in Python environment
- No `requirements.txt` file documenting Python dependencies
- Chromium browser driver not installed

**Python Script** (`/tools/scripts/search_hotels.py`):
- Attempts to scrape Google Hotels via Playwright
- Has fallback when scraping fails (suggests using web_search)
- Converts prices to USD
- Handles selectors for Google's hotel cards

**Missing Dependencies**:
- ❌ `playwright` - NOT INSTALLED
- ❌ Chromium browser driver - NOT INSTALLED

**Fix Required**:
```bash
pip3 install playwright
python3 -m playwright install chromium
```

---

## 3. TOOL REGISTRATION & DISPATCH ANALYSIS

### Tools Registration Flow

**File**: `/tools/index.js`

**Current Implementation**:
```javascript
const ALL_TOOLS = [webSearch, poiSearch, flightSearch, hotelSearch, updateTripInfo];

function getToolDefinitions() {
  // Returns OpenAI function calling format
  // Includes: delegate_to_agents
}

async function executeToolCall(name, args) {
  const handler = toolMap[name];
  if (!handler) throw new Error(`未知工具: ${name}`);
  return handler(args);
}
```

**Status**: ✅ **Correctly Configured**
- Both `search_flights` and `search_hotels` are registered
- Tool mapping includes both tools
- Registration format is correct

### Tool Dispatch in Server.js

**Location**: `/server.js` line 197-315 (`runTool` function)

**Dispatch Logic**:
```javascript
async function runTool(funcName, funcArgs, toolId, sendSSE, tripBook, delegateCtx, reqLog) {
  // 1. Special handling for delegate_to_agents
  if (funcName === 'delegate_to_agents') { ... }
  
  // 2. Execute tool with timeout
  const result = await withTimeout(
    executeToolCall(funcName, funcArgs),
    TOOL_TIMEOUT_MS,  // 30 seconds
    `工具 ${funcName}`
  );
  
  // 3. Parse and sync results to TripBook
  // 4. Handle specific tool results (flights → TripBook, hotels → TripBook, etc.)
}
```

**Timeout Configuration**: 
- `TOOL_TIMEOUT_MS = 30000` (30 seconds) - line 352
- This applies to BOTH flight and hotel searches
- **Potential Issue**: Hotel search with Playwright scraping might timeout

**Result Sync Logic** (lines 238-301):
```javascript
// Flight results sync to TripBook
if (funcName === 'search_flights' && Array.isArray(parsed.flights)) {
  for (const f of parsed.flights) {
    tripBook.addFlightQuote({...});
  }
}

// Hotel results sync to TripBook
if (funcName === 'search_hotels' && Array.isArray(parsed.hotels)) {
  for (const h of parsed.hotels) {
    tripBook.addHotelQuote({...});
  }
}
```

**Status**: ✅ **Correctly Implemented**

---

## 4. RECENT CODE REFACTORING ANALYSIS

### Recent Changes (Commit `b5d4372`)

**Title**: "Implement comprehensive structured logging and improve agent/tool reliability"

**Changes to server.js**:

#### Before (Previous Commit):
```javascript
// Multiple handler functions
async function handleOpenAIChat(...) { ... }
async function handleAnthropicChat(...) { ... }
```

#### After (Current):
```javascript
// Single unified handler
async function handleChat(apiKey, model, systemPrompt, userMessages, sendSSE, baseUrl, tripBook, reqLog) {
  const client = new OpenAI(clientOpts);
  // Only handles OpenAI
}
```

**Import Changes**:
```javascript
// Before - Multiple tool formats & caching
const { getToolDefinitions, getToolDefinitionsForAnthropic, executeToolCall } = require('./tools');
const { getCachedRates } = require('./tools/exchange-rate');
const { getCachedWeather } = require('./tools/weather');
const { initCache: initDestCache } = require('./tools/dest-knowledge');

// After - Simplified
const { getToolDefinitions, executeToolCall } = require('./tools');
```

**Removed Modules**:
- `exchange-rate.js` - Currency conversion tool
- `weather.js` - Weather data caching
- `dest-knowledge.js` - Destination knowledge base
- `getToolDefinitionsForAnthropic()` - Anthropic-specific tool format

**Impact Analysis**:

| Change | Impact on Flight/Hotel | Severity |
|--------|-------------------------|----------|
| Removed Anthropic support | API routing change | Medium |
| Removed exchange-rate tool | Users can't convert USD→CNY | High |
| Removed weather tool | No weather display | Medium |
| Removed dest-knowledge | No auto-complete for destinations | Low |
| Simplified to single handler | Only OpenAI supported now | High |

---

## 5. ARCHITECTURAL ISSUES IDENTIFIED

### Issue 1: Incomplete Provider Support

**Problem**: 
- Current `handleChat()` only supports OpenAI
- Previous version supported both OpenAI and Anthropic
- Code calls `handleChat()` uniformly regardless of provider

**Relevant Code** (server.js, lines 143-144):
```javascript
const effectiveBaseUrl = (provider === 'deepseek') ? (baseUrl || 'https://api.deepseek.com/v1') : baseUrl;
fullText = await handleChat(apiKey, model, systemPrompt, messages, sendSSE, effectiveBaseUrl, tripBook, reqLog) || '';
```

**Issue**: 
- Function is named `handleChat()` but previous version had provider-specific handlers
- Deepseek detection is done but only for base URL, not for actual client creation
- Anthropic is mentioned in comments but handler is gone

**Risk**: Flight/Hotel tools won't work with non-OpenAI providers

### Issue 2: Missing Timeout Extension for Web Scraping

**Problem**:
- Hotel search uses Playwright to scrape Google Hotels
- Requires page loading + DOM parsing + selector waiting
- 30-second timeout might be insufficient

**Current Timeout** (line 352):
```javascript
const TOOL_TIMEOUT_MS = 30000; // 30 seconds
```

**Python Script Timeout** (search_hotels.py, line 34):
```python
page.goto(url, wait_until="domcontentloaded", timeout=45000)  # 45 seconds
page.wait_for_selector('[data-hveid], .Hkjgbb, .kCsInf', timeout=15000)  # 15 seconds
```

**Issue**: 
- Python timeout (45s) > JavaScript timeout (30s)
- If Google Hotels is slow, Node.js process terminates before Python completes
- Error handling shows timeout errors that shouldn't occur

### Issue 3: Missing Python Dependency Documentation

**Problem**:
- No `requirements.txt` for Python dependencies
- Developers won't know to run: `pip3 install fast-flights playwright && python3 -m playwright install chromium`
- Hotel search fails silently on new environments

**Found Dependencies**:
- `fast-flights` (v2.2) ✅ installed
- `playwright` ❌ missing
- Python 3.x ✅ available

---

## 6. DETAILED TOOL EXECUTION FLOW

### How Flight Search Works:

```
User Request → server.js:runTool('search_flights', args)
    ↓
withTimeout(executeToolCall(...), 30s)
    ↓
tools/index.js:executeToolCall()
    ↓
tools/flight-search.js:execute(params)
    ↓
spawn('python3', ['tools/scripts/search_flights.py'])
    ↓
search_flights.py:main()
    ↓
from fast_flights import get_flights
    ↓
JSON output → tools/flight-search.js:execute()
    ↓
Result string → runTool() → TripBook sync
    ↓
User response
```

### How Hotel Search Works:

```
User Request → server.js:runTool('search_hotels', args)
    ↓
withTimeout(executeToolCall(...), 30s)  ← PROBLEM: Might timeout
    ↓
tools/index.js:executeToolCall()
    ↓
tools/hotel-search.js:execute(params)
    ↓
spawn('python3', ['tools/scripts/search_hotels.py'])
    ↓
search_hotels.py:main()
    ↓
from playwright.sync_api import sync_playwright  ← ImportError: No module
    ↓
JSON error output {"error": "playwright 未安装..."}
    ↓
tools/hotel-search.js handles error gracefully
    ↓
Result string → runTool() → User sees error message
```

---

## 7. ERROR HANDLING ANALYSIS

### Flight Search Error Handling:

✅ **Robust**:
```python
if not result or not result.flights:
    → Suggests using web_search tool
    → Provides search query template
    → Graceful fallback
```

### Hotel Search Error Handling:

✅ **Good**:
```python
if not hotels:
    → Returns empty hotels array
    → Suggests web_search tool
    → Provides Google Hotels URL
```

❌ **But fails at import**:
```python
except ImportError as e:
    if 'playwright' in str(e):
        → Clear error message with installation command
```

---

## 8. TIMEOUT ANALYSIS

### Tool Execution Timeouts:

| Tool | Python Timeout | Node.js Timeout | Status |
|------|---|---|---|
| Flight Search | None specified | 30s | ✅ OK |
| Hotel Search | 45s (page load) + 15s (selector) | 30s | ⚠️ Risky |

**Analysis**:
- Flight search uses API call (fast), rarely exceeds timeout
- Hotel search uses web scraping (slow):
  - Page might load slowly
  - Chromium startup takes time
  - DOM querying takes time
  - Selector wait might trigger
- Node.js timeout (30s) is less than Python timeout (45s+15s)
- Result: Could see premature "timeout" errors

### Recommendation:

Extend `TOOL_TIMEOUT_MS` from 30s to 50-60s for hotel search to account for:
1. Python process startup (~500ms)
2. Browser launch (~2-3s)
3. Page load (~10-15s)
4. Selector wait (~5-10s)
5. Data parsing (~1s)

---

## 9. DEPENDENCY SUMMARY

### Node.js Dependencies (package.json):

✅ Required for tool system:
- express
- openai
- @anthropic-ai/sdk

❌ Missing for full provider support:
- (Nothing else for flights/hotels at Node level)

### Python Dependencies (system):

✅ Already installed:
- `fast-flights` v2.2 - for flight search

❌ Missing for hotel search:
- `playwright` - NOT INSTALLED
- Chromium browser driver - NOT INSTALLED

### System Requirements:

✅ Available:
- Python 3.x
- Node.js 

---

## 10. GIT HISTORY ANALYSIS

### Recent Commits Affecting Tools:

1. **abe6f5a** (Latest): "Add comprehensive work completion index"
   - Documentation only

2. **b5d4372** (2 commits ago): "Implement comprehensive structured logging"
   - ⚠️ **MAJOR REFACTORING**
   - Removed Anthropic handler
   - Removed caching tools (weather, exchange-rate, dest-knowledge)
   - Removed `getToolDefinitionsForAnthropic()`
   - Added structured logging
   - Flight/Hotel tools themselves UNCHANGED ✅

3. **4c39b33**: "Fix TripBook persistence chain"
   - TripBook-related changes only

---

## 11. ROOT CAUSES IDENTIFIED

### Why Flight Search Works:
1. ✅ Tool is registered in `tools/index.js`
2. ✅ `fast-flights` Python library is installed
3. ✅ No external browser needed (API-based)
4. ✅ Timeout is sufficient
5. ✅ Error handling is robust

### Why Hotel Search Fails:
1. ✅ Tool is registered in `tools/index.js`
2. ❌ **`playwright` Python library NOT INSTALLED**
3. ❌ **Chromium browser driver NOT INSTALLED**
4. ✅ Script exists and is well-written
5. ✅ Error handling explains the problem clearly
6. ⚠️ Timeout might be insufficient for scraping

### Why Users Report Issues:
1. Hotel search completely fails with clear error message
2. Flight search might fail if:
   - `fast-flights` becomes rate-limited
   - Google Flights API structure changes
   - Timeout triggered (unlikely)
3. Both removed from toolset if Anthropic/DeepSeek used (after refactoring)

---

## 12. ENVIRONMENT SETUP VERIFICATION

### Current State:

**Node.js environment**:
```
✅ Package.json dependencies installed
✅ Express server running on port 3002
✅ Rate limiting configured
✅ Sentry error monitoring available
❌ Support for Anthropic/DeepSeek providers broken
```

**Python environment**:
```
✅ Python 3 available
✅ fast-flights (v2.2) installed
❌ playwright NOT installed
❌ playwright chromium driver NOT installed
```

### Production Readiness:

| Component | Status | Blocker |
|-----------|--------|---------|
| Flight Search | ✅ Ready | No |
| Hotel Search | ❌ Broken | YES |
| OpenAI/DeepSeek | ⚠️ Partial | No (OpenAI works) |
| Anthropic | ❌ Broken | YES (if needed) |
| Error Handling | ✅ Good | No |
| Logging | ✅ Structured | No |
| Rate Limiting | ✅ Configured | No |

---

## 13. KEY FILES SUMMARY

### Flight Search:

**Definition**: `/tools/flight-search.js` (62 lines)
- Timeout: 60 seconds (Python-side)
- Robust error handling
- Deduplication logic
- Multiple fallback modes

**Script**: `/tools/scripts/search_flights.py` (174 lines)
- Uses `fast-flights` library
- Handles "Price unavailable" gracefully
- Comprehensive error messages

### Hotel Search:

**Definition**: `/tools/hotel-search.js` (62 lines)
- Timeout: 70 seconds (Python-side)
- Error handling for missing dependencies
- Fallback to web search suggestion

**Script**: `/tools/scripts/search_hotels.py` (104 lines)
- Uses `playwright` for scraping
- Google Hotels URL construction
- DOM parsing with fallbacks
- Lacks headless mode configuration detail

### Registration:

**Registry**: `/tools/index.js` (48 lines)
- Both tools properly registered
- Correct OpenAI function format
- Unified execution interface

---

## 14. VERIFICATION CHECKLIST

✅ = Verified as working/correct
❌ = Missing/Broken
⚠️ = Partial/Risky

- [✅] Flight search tool definition exists
- [✅] Flight search tool is registered
- [✅] Flight search Python script exists
- [✅] fast-flights library installed
- [✅] Flight search manually tested - WORKS
- [✅] Hotel search tool definition exists
- [✅] Hotel search tool is registered
- [✅] Hotel search Python script exists
- [❌] playwright library NOT installed - BLOCKS HOTEL SEARCH
- [❌] Chromium browser NOT installed - BLOCKS HOTEL SEARCH
- [✅] Hotel search Python script well-written
- [✅] Tool dispatch logic correct
- [✅] Result sync to TripBook implemented
- [✅] Error handling implemented
- [⚠️] Timeout (30s) may be insufficient for hotel scraping
- [❌] Python dependencies not documented (no requirements.txt)
- [❌] Anthropic provider support removed (recent refactoring)
- [✅] DeepSeek base URL detection present

---

## SUMMARY & RECOMMENDATIONS

### Issues Found:

1. **CRITICAL**: Hotel search tool fails - Playwright not installed
2. **HIGH**: Provider support incomplete - Only OpenAI works
3. **MEDIUM**: Timeout configuration risky for web scraping
4. **MEDIUM**: Python dependencies undocumented
5. **LOW**: Chromium driver not pre-installed

### Immediate Actions Required:

1. **Install Playwright**:
   ```bash
   pip3 install playwright
   python3 -m playwright install chromium
   ```

2. **Create requirements.txt**:
   ```
   fast-flights>=2.2
   playwright>=1.40.0
   ```

3. **Update timeout for hotel search** (if scraping is too slow):
   ```javascript
   const HOTEL_SEARCH_TIMEOUT_MS = 60000; // 60 seconds
   ```

### Medium-term Fixes:

1. Restore Anthropic provider support
2. Restore weather/exchange-rate tools if needed
3. Add playwright browser pooling for efficiency
4. Add comprehensive Python setup documentation

---

## RESEARCH COMPLETE ✅

All requested investigation items completed:
- ✅ Tool definition files examined
- ✅ Tool registration in server.js verified
- ✅ Tool dispatch mechanism analyzed
- ✅ Recent code changes investigated
- ✅ API key requirements checked
- ✅ External service dependencies identified
- ✅ Configuration issues found
- ✅ Error handling reviewed
- ✅ Timeout issues identified
- ✅ Git history reviewed

