# Flight & Hotel Search Tools - Quick Fix Guide

## Problem Summary

- ✅ **Flight Search**: WORKS (all dependencies installed)
- ❌ **Hotel Search**: BROKEN (missing Playwright dependency)
- ⚠️ **Architecture**: Recent refactoring broke Anthropic/DeepSeek support

## Quick Fix - Hotel Search

### Step 1: Install Playwright
```bash
pip3 install playwright
python3 -m playwright install chromium
```

### Step 2: Verify Installation
```bash
echo '{"city":"Kuala Lumpur","checkin":"2026-04-20","checkout":"2026-04-22"}' | python3 tools/scripts/search_hotels.py
```

Expected output: JSON with hotel list (not an error about missing playwright)

### Step 3: Create Python Requirements File

**Create**: `requirements.txt`
```
fast-flights>=2.2
playwright>=1.40.0
```

## Verify Flight Search Still Works
```bash
echo '{"origin":"MFM","destination":"KUL","date":"2026-04-20","passengers":1}' | python3 tools/scripts/search_flights.py
```

Expected output: JSON with flight options

## Optional Timeout Adjustment

If hotel search times out (30s is tight for web scraping), update `server.js`:

**Location**: Line 352
```javascript
// Before:
const TOOL_TIMEOUT_MS = 30000; // 30 seconds

// After:
const TOOL_TIMEOUT_MS = 60000; // 60 seconds
```

## Known Issues (Recent Refactoring)

⚠️ **Anthropic Provider**: No longer supported (commit b5d4372)
⚠️ **DeepSeek Provider**: Base URL detection exists but client creation may not work
⚠️ **Missing Tools**: Weather, Exchange Rate, Destination Knowledge removed

These are architectural issues, not tool-specific problems.

## Test Both Tools in Server

Once fixed, tools will be available in the chat interface:
- Tool registration: `✅` in `/tools/index.js`
- Dispatch logic: `✅` in `runTool()` function
- TripBook integration: `✅` working

## Files Involved

| File | Status | Issue |
|------|--------|-------|
| `/tools/flight-search.js` | ✅ OK | None |
| `/tools/hotel-search.js` | ✅ OK | None |
| `/tools/scripts/search_flights.py` | ✅ OK | None |
| `/tools/scripts/search_hotels.py` | ✅ OK | Depends on Playwright |
| `/tools/index.js` | ✅ OK | None |
| `server.js` | ⚠️ Partial | Provider support broken |
| `package.json` | ✅ OK | None |
| `requirements.txt` | ❌ MISSING | Needs creation |

## Estimated Fix Time

- Install Playwright: 2-3 minutes
- Verify: 1 minute
- Create requirements.txt: 1 minute
- Total: ~5 minutes

## Reference

See `TOOLS_INVESTIGATION_REPORT.md` for comprehensive analysis.
