# System Prompt Analysis Documentation

This directory contains comprehensive analysis documents for understanding and refactoring the main agent's system prompt to work without sub-agents.

## Documents Overview

### 1. **ANALYSIS_SUMMARY.txt** ⭐ START HERE
Quick overview of findings, file locations, and what guidance already exists.
- File size: ~8.5 KB
- Reading time: 5-10 minutes
- Best for: Understanding the big picture

### 2. **SYSTEM_PROMPT_ANALYSIS.md** - DETAILED REFERENCE
Complete technical analysis with line-by-line breakdowns.
- File size: ~25 KB  
- Reading time: 20-30 minutes
- Best for: Understanding implementation details

### 3. **REFACTORING_QUICK_GUIDE.md** - IMPLEMENTATION ROADMAP
Step-by-step checklist for migration, testing scenarios, and success criteria.
- File size: ~12 KB
- Reading time: 10-15 minutes
- Best for: Planning the actual refactoring work

### 4. **MIGRATION_MAP.txt** - VISUAL REFERENCE
ASCII-formatted breakdown of what to add to main prompt, organized by tool.
- File size: ~15 KB
- Reading time: 5-10 minutes
- Best for: Seeing exactly what guidance each tool needs

### 5. **README_SYSTEM_PROMPT_ANALYSIS.md** - THIS FILE
Navigation guide for all analysis documents.

---

## Quick Facts

| Item | Details |
|------|---------|
| Main Prompt File | `prompts/system-prompt.js` |
| Main Prompt Size | 9.3 KB (187 lines) |
| Expected After Refactor | 15-20 KB (250-300 lines) |
| Lines to Add | ~100-150 lines total |
| Sub-Agent Files | `agents/prompts/booking.js`, `activity.js`, `knowledge.js` |
| Tools to Migrate | search_flights, search_hotels, search_poi, web_search, get_weather, get_exchange_rate |
| System Entry | `server.js` line 178: `buildSystemPrompt()` |

---

## Key Findings

✅ **What's Already Ready:**
- Main agent CAN already call all 8 tools directly (lines 121-132)
- Tool availability list already exists in system prompt
- Basic guidance for most tools already present
- Timing rules for tool usage already established
- Phase-based planning methodology established

❌ **What Needs Adding:**
- Detailed flight search strategy (multi-airport, ±3 days, budget airlines)
- Detailed hotel search strategy (platform discovery, neighborhoods, price tiers)
- POI search quality filters and neighborhood-based approach
- Consolidated web search strategy across all categories
- Weather nuance (climate vs. forecast distinction)
- Exchange rate presentation guidelines

---

## Migration Path

### Phase 1: Analysis ✅ (COMPLETE)
- [x] Create ANALYSIS_SUMMARY.txt
- [x] Create SYSTEM_PROMPT_ANALYSIS.md
- [x] Create REFACTORING_QUICK_GUIDE.md
- [x] Create MIGRATION_MAP.txt

### Phase 2: Plan
- [ ] Read ANALYSIS_SUMMARY.txt (5 min)
- [ ] Read REFACTORING_QUICK_GUIDE.md (10 min)
- [ ] Decide implementation order

### Phase 3: Implement
- [ ] Update prompts/system-prompt.js with tool strategies
- [ ] Update server.js tool limits if needed
- [ ] Test with simple trip scenario
- [ ] Test with complex trip scenario

### Phase 4: Deploy
- [ ] Gradual rollout with monitoring
- [ ] Compare metrics vs. current system
- [ ] Collect user feedback

### Phase 5: Cleanup
- [ ] Remove delegation logic
- [ ] Archive/delete agent prompts
- [ ] Remove delegate_to_agents tool

---

## Navigation Guide

**If you want to...**

**Understand the current state:**
→ Read `ANALYSIS_SUMMARY.txt`

**Get an implementation checklist:**
→ Read `REFACTORING_QUICK_GUIDE.md`

**See detailed technical breakdown:**
→ Read `SYSTEM_PROMPT_ANALYSIS.md`

**See exactly what to add per tool:**
→ Read `MIGRATION_MAP.txt`

**Copy guidance for search_flights:**
→ See SYSTEM_PROMPT_ANALYSIS.md Section 5 OR MIGRATION_MAP.txt search_flights section

**Copy guidance for search_hotels:**
→ See SYSTEM_PROMPT_ANALYSIS.md Section 5 OR MIGRATION_MAP.txt search_hotels section

**Copy guidance for web_search:**
→ See MIGRATION_MAP.txt web_search section (organized by query category)

**Know what to test:**
→ See REFACTORING_QUICK_GUIDE.md Testing Scenarios section

**Understand success/failure criteria:**
→ See REFACTORING_QUICK_GUIDE.md Success Criteria OR ANALYSIS_SUMMARY.txt Section 8

---

## Key Statistics

### Sub-Agent Knowledge to Migrate

| Agent | File | Size | Lines | What It Covers |
|-------|------|------|-------|--------|
| Booking | `agents/prompts/booking.js` | 8.2 KB | 168 | Flights (56 lines) + Hotels (57 lines) |
| Activity | `agents/prompts/activity.js` | 8.6 KB | 165 | Restaurants (77 lines) + Attractions (60 lines) |
| Knowledge | `agents/prompts/knowledge.js` | 6.6 KB | 122 | Visa, Weather, Destination caching |
| **Total** | | **23.4 KB** | **455** | Full comprehensive travel research |

### Guidance Gaps in Main Prompt

| Tool | Current | Gap | Priority |
|------|---------|-----|----------|
| search_flights | 1 line | 40 lines needed | HIGH |
| search_hotels | 1 line | 45 lines needed | HIGH |
| search_poi | 1 line | 25 lines needed | MEDIUM |
| web_search | 1 line | 60 lines needed | HIGH |
| get_weather | 1 line | 15 lines needed | MEDIUM |
| get_exchange_rate | 1 line | 10 lines needed (enhancement) | LOW |

---

## Implementation Priority

1. **search_flights** - Most complex, highest impact
2. **web_search** - Underpins all research
3. **search_hotels** - Complex platform discovery
4. **search_poi** - Filters and neighborhood strategies
5. **get_weather** - Climate vs. forecast distinction
6. **get_exchange_rate** - Presentation standards

---

## Tools Available

All 8 tools are already available to the main agent:

```javascript
1. web_search              // General web searching
2. get_weather             // Weather forecasts (start_date + end_date required)
3. get_exchange_rate       // Currency conversion (USD ↔ CNY, etc.)
4. search_poi              // Restaurant/attraction/location search (Google Maps)
5. search_flights          // Flight searching
6. search_hotels           // Hotel searching
7. cache_destination_knowledge    // Store destination info for later
8. update_trip_info        // Update trip itinerary & constraints
```

Plus `delegate_to_agents` (which will be removed during Phase 4/5).

---

## Prompt Assembly Flow

```
buildSystemPrompt() in prompts/system-prompt.js
    ↓
1. Current time + Holiday calendar
    ↓
2. Cached exchange rates (if no TripBook)
    ↓
3. Cached weather (if no TripBook)
    ↓
4. CORE AGENT INSTRUCTIONS (lines 53-156) ← WHERE TO ADD TOOL STRATEGIES
    - Role definition
    - Progressive planning methodology
    - Tool usage strategy (lines 108-156)
    - Delegation strategy (will be deprecated)
    - Direct tool availability (lines 121-132) ← EXPAND HERE
    ↓
5. Injected destination knowledge (if cached + mentioned)
    ↓
6. TripBook reference section (trip state)
    ↓
Final assembled prompt → Main agent
```

---

## Expected Outcomes

### ✅ Success Indicators
- Main agent makes direct tool calls instead of delegating
- Recommendation quality maintained or improved
- Tool call volume ≤1.2x of current model
- Response time < 30 seconds typical
- Token usage per trip equal or lower

### ❌ Red Flags
- Quality degradation (missed deals, bad recommendations)
- Tool round limit exhausted frequently (>10% of conversations)
- Cost per trip increases >20%
- User complaints about missing expertise
- Response latency >45 seconds

---

## Contact & Questions

This analysis covers:
- File structure and imports
- System prompt assembly
- What guidance exists vs. what's missing
- Where to migrate guidance from
- How to implement changes
- Testing strategies
- Success criteria

For specific questions about:
- **Tool parameters** → Check `tools/` directory
- **Server architecture** → Check `server.js` lines 114-637
- **TripBook design** → Check `models/trip-book.js`
- **Current delegation** → Check `agents/delegate.js`

