# AI Travel Planner - File Exploration Report

## Project Overview
- **Root Directory**: `/Users/geraldhuang/DEV/ai-travel-planner`
- **Main Entry Point**: `server.js` (Express server, SSE streaming)
- **Data Model**: `models/trip-book.js` (TripBook - single source of truth per session)
- **Tools Registry**: `tools/index.js` (8 tools total)
- **System Prompt Builder**: `prompts/system-prompt.js`

---

## 1. DESTINATION KNOWLEDGE CACHING (dest-knowledge.js)

### File: `tools/dest-knowledge.js`

#### Current Structure (In-Memory Map)
- **Lines 1-7**: Module header + TTL constant
  - `CACHE_TTL = 30 * 24 * 60 * 60 * 1000` (30 days in milliseconds)
  - `destCache = new Map()` - Simple in-memory Map
  
- **Lines 9-32**: Tool definition (`TOOL_DEF`)
  - Name: `cache_destination_knowledge`
  - Parameters: `destination` (string), `content` (Markdown string)
  - Description: Guides AI to cache destination knowledge (visa, currency, language, seasons, transport, entry notes, payment methods)
  
- **Lines 34-40**: Execute function
  ```javascript
  async function execute({ destination, content }) {
    // Stores: destCache.set(destination, { content, saved_at: Date.now() })
    // Returns: JSON response with success flag and message
  }
  ```

- **Lines 42-48**: `getCachedDestKnowledge(destination)`
  - Retrieves cache entry by destination name
  - Checks TTL expiry: `Date.now() - entry.saved_at > CACHE_TTL`
  - Returns `null` if expired, otherwise returns `{ content, saved_at }`

- **Lines 50-59**: `getAllCachedDests()`
  - Iterates through entire Map
  - Returns array of non-expired destinations
  - Cleans up expired entries during iteration

#### Current Behavior
- **Persistence**: ZERO - purely in-memory, lost on server restart
- **TTL Logic**: Lines 6 & 46 - 30-day TTL, checked on every retrieval
- **Data Structure**: `Map<string, { content: string, saved_at: number }>`
- **Exports**: `{ TOOL_DEF, execute, getCachedDestKnowledge, getAllCachedDests }`

#### How It's Integrated
- **tools/index.js line 11**: `const destKnowledge = require('./dest-knowledge');`
- **tools/index.js line 38**: Added to `toolMap[t.TOOL_DEF.name] = t.execute`
- **prompts/system-prompt.js line 9**: `const { getAllCachedDests } = require('../tools/dest-knowledge');`
- **server.js line 250**: When AI calls `cache_destination_knowledge`, syncs to TripBook: `tripBook.addKnowledgeRef(parsed.destination);`

---

## 2. SERVER.JS INTEGRATION POINTS

### File: `server.js` (24,280 bytes)

#### A. `extractItineraryInfo()` Function
- **Lines 282-392**: Post-processing step after AI replies (fallback when AI doesn't call update_trip_info)
- **Purpose**: Extract structured itinerary info via regex patterns
- **Line 286**: Removes Markdown list prefixes (`^\d+\.\s+`)
- **Extracts**:
  - `destination`: Lines 291-307 (patterns with "前往", "去", etc.)
  - `days`: Line 310-311 (looks for `\d+[天日]`)
  - `people`: Lines 315-327 (looks for person count patterns)
  - `budget`: Lines 331-347 (patterns with "预算", "花费", currency amounts)
  - `dates`: Lines 350-353 (ISO dates or Chinese date format)
  - `departCity`: Lines 357-372 (patterns like "从XX出发")
  - `preferences`: Lines 375-380 (keywords: 潜水, 美食, 文化, etc.)
  - `phase`: Lines 382-389 (detects planning phase 1-7)
- **Returns**: Object with extracted fields or `null` if nothing found
- **Used By**:
  - Line 483: In OpenAI handler if no tool calls made
  - Line 562: In Anthropic handler if no tool calls made

#### B. `runTool()` Function
- **Lines 187-277**: Executes tool and syncs results to TripBook
- **Line 188**: Sends `tool_start` SSE event
- **Line 190**: `executeToolCall(funcName, funcArgs)` - wrapper from tools/index.js
- **Lines 198-269**: TripBook synchronization
  
  **Key sync points:**
  - **Lines 204-210**: Exchange rate results
    - Sends `rate_cached` SSE event
    - Calls `tripBook.setExchangeRate()`
  
  - **Lines 213-219**: Weather results
    - Sends `weather_cached` SSE event
    - Calls `tripBook.setWeather()`
  
  - **Lines 223-232**: Flight quotes
    - Calls `tripBook.addFlightQuote()` for each flight
    - Extracts: route, date, airline, price_usd, price_cny, duration, stops
  
  - **Lines 236-245**: Hotel quotes
    - Calls `tripBook.addHotelQuote()` for each hotel
    - Extracts: name, city, checkin, checkout, nights, price_per_night_usd, price_total_cny, rating
  
  - **Lines 249-250**: Destination knowledge
    - Calls `tripBook.addKnowledgeRef(parsed.destination)`
    - Adds destination to knowledge refs
  
  - **Lines 254-267**: **CRITICAL** - `update_trip_info` handling
    ```javascript
    if (funcName === 'update_trip_info' && parsed.success && parsed.updates) {
      const updates = parsed.updates;
      if (updates.constraints) tripBook.updateConstraints(updates.constraints);
      if (updates.phase !== undefined) tripBook.updatePhase(updates.phase);
      if (updates.itinerary) tripBook.updateItinerary(updates.itinerary);
      // Line 266: SENDS tripbook_update EVENT
      sendSSE('tripbook_update', tripBook.toPanelData());
    }
    ```

#### C. `tripbook_update` SSE Event
- **Line 266**: Sent when `update_trip_info` tool succeeds
- **Data**: `tripBook.toPanelData()` - Panel data for frontend
- **Also sent in OpenAI handler line 500**
- **Also sent in Anthropic handler line 577**

#### D. OpenAI Handler Post-Processing
- **Lines 482-504** (after tool loop ends without more tool calls):
  ```javascript
  if (fullText) {
    const itinInfo = extractItineraryInfo(fullText);
    if (itinInfo && tripBook) {
      // ... extract constraints from regex
      tripBook.updateConstraints(constraints);
      if (itinInfo.phase) tripBook.updatePhase(itinInfo.phase);
      // Line 500: SENDS tripbook_update EVENT (fallback when AI didn't call update_trip_info)
      sendSSE('tripbook_update', tripBook.toPanelData());
    }
    // Line 503: Also sends itinerary_update (backward compatibility)
    if (itinInfo) sendSSE('itinerary_update', itinInfo);
  }
  ```

#### E. Anthropic Handler Post-Processing
- **Lines 558-580** (same pattern as OpenAI):
  - Lines 559-560: Extracts text blocks from response
  - Line 562: Calls `extractItineraryInfo(fullText)`
  - Lines 563-577: Updates TripBook if itinInfo found
  - Line 577: Sends `tripbook_update` SSE event
  - Line 579: Sends `itinerary_update` for compatibility

#### F. System Prompt Injection
- **Line 120**: `buildSystemPrompt(conversationText, knownRates, knownWeather, tripBook)`
  - Passes tripBook to system prompt builder
  - TripBook methods: `toSystemPromptSection()` (line 358 of trip-book.js)

---

## 3. TRIPBOOK MODEL (models/trip-book.js)

### File: `models/trip-book.js` (471 lines)

#### Data Structure (4-Layer Architecture)

**Layer 1: Static Knowledge References**
- `knowledgeRefs[]` - References to destination knowledge (e.g., ["日本", "泰国"])
- `activityRefs[]` - References to activity knowledge (e.g., ["潜水"])
- **NOT persisted to file** - only referenced by key

**Layer 2: Dynamic Data (with TTL)**
- `dynamic.weather{}` - By city key, contains: city, current, forecast, _meta (fetched_at, ttl)
- `dynamic.exchangeRates{}` - By currency pair key (e.g., "JPY_CNY"), contains: from, to, rate, last_updated, _meta
- `dynamic.flightQuotes[]` - Array with id, route, date, airline, price_usd, price_cny, duration, stops, status
- `dynamic.hotelQuotes[]` - Array with id, name, city, checkin, checkout, nights, price_per_night_usd, price_total_cny, rating, status

**Layer 3: User Constraints**
- `constraints.destination` - { value, cities[], confirmed, confirmed_at }
- `constraints.departCity` - { value, airports[], confirmed, confirmed_at }
- `constraints.dates` - { start, end, days, flexible, confirmed, confirmed_at }
- `constraints.people` - { count, details, confirmed, confirmed_at }
- `constraints.budget` - { value, per_person, currency, confirmed, confirmed_at }
- `constraints.preferences` - { tags[], notes, confirmed, confirmed_at }
- `constraints.specialRequests[]` - Array of { type, value, confirmed }
- `constraints._history[]` - Change log

**Layer 4: Structured Itinerary**
- `itinerary.phase` - Current phase (0-7)
- `itinerary.phaseLabel` - Phase name (e.g., "构建框架")
- `itinerary.route[]` - Cities visited (e.g., ["东京", "京都", "大阪"])
- `itinerary.days[]` - Daily plans: { day, date, city, title, segments[] }
- `itinerary.budgetSummary` - { flights, hotels, ..., total_cny, budget_cny, remaining_cny }
- `itinerary.reminders[]` - Action items

#### Key Methods

**Write Methods:**
- `updateConstraints(delta)` - Lines 126-164 (incremental update with history tracking)
- `updatePhase(phase)` - Lines 173-178
- `updateItinerary(delta)` - Lines 184-218 (incremental update, merges days by day number)
- `setWeather(cityKey, data)` - Line 86
- `setExchangeRate(key, data)` - Line 91
- `addFlightQuote(quote)` - Line 96 (generates ID, returns it)
- `addHotelQuote(quote)` - Line 104 (generates ID, returns it)

**Read/Export Methods:**
- `toSystemPromptSection()` - Lines 358-380 (generates prompt text for system prompt injection)
- `buildConstraintsPromptSection()` - Lines 227-277
- `buildItineraryPromptSection()` - Lines 282-312
- `buildDynamicDataPromptSection()` - Lines 317-353
- `toPanelData()` - Lines 390-441 (flattened data for frontend UI)

**Serialization:**
- `toJSON()` - Lines 447-457 (all 4 layers)
- `static fromJSON(json)` - Lines 459-468 (deserialization)

---

## 4. SYSTEM PROMPT BUILDING (prompts/system-prompt.js)

### File: `prompts/system-prompt.js` (134 lines)

#### Integration with Destination Knowledge
- **Line 9**: Imports `getAllCachedDests` from dest-knowledge.js
- **Line 11**: Signature: `buildSystemPrompt(conversationText, knownRates, knownWeather, tripBook)`
- **Lines 109-127**: Knowledge injection logic
  - Checks conversation text for destination keywords
  - Injects destination KB from static files (malaysia.js, diving.js)
  - NO integration of cached destination knowledge yet

#### Knowledge Files Structure
- `prompts/knowledge/malaysia.js` - Static KB for Malaysia
- `prompts/knowledge/diving.js` - Static KB for diving activities
- `prompts/knowledge/holidays.js` - Chinese holiday calendar
- `prompts/knowledge/methodology.js` - Planning methodology

#### System Prompt Sections
1. Current time (lines 14-24)
2. Holiday knowledge (line 27)
3. Exchange rates/weather (lines 29-50) - only if no TripBook
4. Role definition (lines 52-63)
5. Methodology (line 66)
6. Tool strategy (lines 68-100)
7. Source attribution rules (lines 102-106)
8. Static destination KB (lines 108-120)
9. TripBook section (lines 122-127)

#### Notable Rules for Destination Knowledge (Lines 85-92)
```
当用户提到一个目的地（国家/城市），且系统提示中**尚无该目的地的知识库**时，必须：
1. 并行调用 web_search 搜索基础信息
2. 整理为结构化 Markdown 后调用 cache_destination_knowledge 保存
3. 之后直接使用缓存内容，不再重复搜索同一目的地的基础信息
```
**PROBLEM**: This rule is never fulfilled because:
- `getAllCachedDests()` is imported but never called
- Cached destinations are never injected into system prompt
- Each conversation treats destination knowledge as fresh

---

## 5. EXISTING FILE STORAGE PATTERNS

### Current State
- **NO persistent file storage** - Entire project is in-memory only
- **NO `.data/` directory** - Project doesn't create data directories
- **NO `.cache/` directory** - Project doesn't use cache directories
- **NO file I/O** - No `fs` module usage found in tools

### Directories in Root
- `models/` - OOP classes (only TripBook)
- `prompts/` - Static knowledge files
- `tools/` - Tool implementations
- `public/` - Frontend (static HTML/JS/CSS)
- `.claude/` - Claude Code internal storage

### Data Loss Pattern
- Server restart = all destination caches lost
- All in-memory caches (exchange rates, weather) lost
- No persistence across sessions

---

## 6. TOOL EXECUTION FLOW

### Call Chain
1. **Frontend** sends chat request to `/api/chat`
2. **server.js line 21** receives `POST /api/chat`
3. **server.js line 120** builds system prompt (includes destination KB rules)
4. **server.js line 123-130** routes to OpenAI or Anthropic handler
5. **handler loops** (line 411-508 for OpenAI, line 524-583 for Anthropic)
   - Streams from AI model
   - Accumulates text + tool calls
   - For each tool call:
     - **server.js line 474/550** calls `runTool(funcName, funcArgs, ...)`
     - **runTool() line 190** calls `executeToolCall()` from tools/index.js
     - **tools/index.js line 40-46** dispatches to tool handler
     - Tool returns result string
     - **runTool() lines 198-269** syncs to TripBook, sends SSE events
   - If AI made tool calls, loops continues
   - If AI made NO tool calls, breaks
6. **Post-processing**:
   - **server.js line 483-504** (OpenAI) or line 562-579 (Anthropic)
   - Calls `extractItineraryInfo()` as fallback
   - Updates TripBook if regex found info
   - Sends `tripbook_update` SSE event

### SSE Events Sent
- `token` - Text tokens from AI
- `tool_start` - Tool execution began
- `tool_result` - Tool execution completed with label
- `rate_cached` - Exchange rate cached
- `weather_cached` - Weather cached
- `tripbook_update` - TripBook panel data (CRITICAL for UI sync)
- `itinerary_update` - Legacy event (regex extraction)
- `error` - Error occurred
- `done` - Conversation complete

---

## 7. IMPLEMENTATION PLANNING NOTES

### For Converting dest-knowledge.js to File-Based

**Current API (must maintain):**
```javascript
// From tools/dest-knowledge.js
execute({ destination, content }) // called via tools/index.js
getCachedDestKnowledge(destination) // NO current usage, but exported
getAllCachedDests() // imported in system-prompt.js, but NOT CALLED
```

**Replacement Design Should:**
1. Keep same export interface
2. Store to `/data/destination-cache/` directory
3. Each destination = separate `.json` file with { content, saved_at }
4. TTL logic stays same (30 days)
5. Cleanup expired files on startup or lazy
6. Sync to `getAllCachedDests()` properly for system prompt injection

### For System Prompt Integration

**Current State (line 85-92 of system-prompt.js):**
- Describes when to cache destination knowledge
- NEVER injects cached destinations into prompt
- So AI always treats destinations as fresh

**Fix Required:**
1. Call `getAllCachedDests()` in buildSystemPrompt()
2. Inject cached destinations as "已缓存目的地知识库" section
3. Tell AI to use cache before calling web_search

### For Post-Processing Integration

**Current State:**
- extractItineraryInfo() extracts regex patterns
- Updates TripBook if regex found anything
- Sends tripbook_update event

**Enhancement Opportunity:**
- Could extract destination knowledge opportunities
- Trigger cache_destination_knowledge calls
- But would need AI wrapper (not post-processing friendly)

---

## 8. FILE PATHS AND LINE REFERENCES SUMMARY

| Item | File | Lines | Details |
|------|------|-------|---------|
| In-memory cache | `tools/dest-knowledge.js` | 6-7 | `destCache = new Map()`, CACHE_TTL=30d |
| Tool definition | `tools/dest-knowledge.js` | 9-32 | TOOL_DEF object |
| Execute function | `tools/dest-knowledge.js` | 34-40 | Stores to Map |
| getTTL logic | `tools/dest-knowledge.js` | 42-48 | Checks: `now - saved_at > TTL` |
| Get all cached | `tools/dest-knowledge.js` | 50-59 | Returns array of non-expired |
| Tool dispatch | `tools/index.js` | 36-46 | executeToolCall wrapper |
| System prompt builder | `prompts/system-prompt.js` | 11 | buildSystemPrompt signature |
| Destination KB rules | `prompts/system-prompt.js` | 85-92 | Rules for when to cache |
| Extract itinerary | `server.js` | 282-392 | Regex extraction, 110 lines |
| RunTool function | `server.js` | 187-277 | Execution + TripBook sync |
| update_trip_info handling | `server.js` | 254-267 | Syncs to TripBook, sends event |
| OpenAI post-processing | `server.js` | 482-504 | Fallback extraction, tripbook_update |
| Anthropic post-processing | `server.js` | 558-580 | Same pattern as OpenAI |
| TripBook constraints | `models/trip-book.js` | 43-52 | Layer 3 structure |
| updateConstraints method | `models/trip-book.js` | 126-164 | Incremental update with history |
| toSystemPromptSection | `models/trip-book.js` | 358-380 | Generates prompt text |
| toPanelData export | `models/trip-book.js` | 390-441 | Flattened UI data |

---

## Key Insights

1. **Current dest-knowledge.js is purely in-memory** - Simple Map with TTL logic
2. **No persistence across restarts** - Entire cache lost on server restart
3. **No file storage patterns exist** - Project doesn't write to disk anywhere
4. **Destination KB never injected** - `getAllCachedDests()` is imported but never used in system prompt
5. **Post-processing syncs to TripBook** - Both extractItineraryInfo() paths call tripBook.update* methods
6. **SSE events are critical** - Frontend depends on `tripbook_update` events to stay in sync
7. **TripBook is session-scoped** - Created new per `/api/chat` call, destroyed when response ends
8. **Tool syncing is central** - `runTool()` is the hub for converting tool results → TripBook updates
9. **Phase detection exists** - Both extractItineraryInfo() and update_trip_info support phase 1-7 tracking
10. **Incremental updates** - TripBook.updateConstraints() merges rather than replaces

