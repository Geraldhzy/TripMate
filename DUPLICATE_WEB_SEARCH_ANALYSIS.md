# AI Travel Planner: Duplicate Web Search Root Cause Analysis

## Executive Summary

The app makes duplicate `web_search` calls for visa information due to **missing deduplication logic in the agent loop**. The system has infrastructure to prevent re-searches (destination knowledge caching, TripBook dynamic data tracking), but no mechanism to check if a web search has already been performed before executing a new one.

**Root Cause:** The LLM is not provided information about **which web_search queries have already been executed** during the current conversation.

---

## The Problem: Duplicate Search Pattern

From your screenshot:
```
1. update_trip_info (record constraints)
2. web_search "土耳其电子签证 中国护照 2026 官网 evisa.gov.tr" → 8 results
3. search_flights → 5 routes
4. web_search "土耳其电子签证官方网站 evisa.gov.tr 2026 中国公民" → 8 results  ⚠️ DUPLICATE!
5. get_exchange_rate USD→CNY
6. get_weather Istanbul
```

Both searches are looking for Turkish visa info for Chinese passport holders, just with slightly different keyword ordering. This is functionally redundant.

---

## System Architecture Analysis

### 1. Agent Loop Flow (server.js: handleOpenAIChat, handleAnthropicChat)

**Lines 659-738 (OpenAI) and 755-801 (Anthropic):**

```
for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
  1. Call LLM with current messages (including system prompt + user history)
  2. LLM returns: text tokens + tool calls
  3. For each tool call:
     a. Execute tool (runTool)
     b. Parse result to JSON
     c. Append tool result to messages array
     d. Continue loop
  4. When no more tool calls: exit loop, return full text
}
```

**Key Insight:** After each tool execution, the tool result is appended to the `messages` array:
```javascript
messages.push({ role: 'assistant', content: fullText, tool_calls: [...] });
messages.push({ role: 'tool', tool_call_id: toolCall.id, content: resultStr });
```

This history is fed back to the LLM in the next round, but **there's no structured tracking of WHICH tools with WHICH parameters have been executed**.

### 2. System Prompt Design (prompts/system-prompt.js)

**Lines 29-50 & 70-100:**

The system prompt includes explicit instructions:
```javascript
"## 工具使用策略
...
- **同一城市天气在本次对话中只需查询一次，结果作为背景信息复用，无需重复查询。**
- **同一货币对汇率在本次对话中只需查询一次，结果作为背景信息复用。**
...
## 目的地知识库自动构建规则
当用户提到一个目的地（国家/城市），且系统提示中**尚无该目的地的知识库**时，必须：
1. 并行调用 web_search 搜索以下信息（2-3次搜索即可覆盖）
...
3. 之后直接使用缓存内容，**不再重复搜索同一目的地的基础信息**
```

**Problem:** These instructions assume the LLM will magically remember previous searches just from reading past tool results in plain text. But:
- The results from web_search #2 are raw JSON with 8 search results
- The LLM has no explicit indicator saying "web_search for Turkish visa was already done"
- The LLM may interpret the second query as slightly different enough to require a new search

### 3. Destination Knowledge Caching (tools/dest-knowledge.js)

**Lines 15-46:**

```javascript
const TOOL_DEF = {
  name: 'cache_destination_knowledge',
  description: 'Will destination basic info...',
  ...
}

async function execute({ destination, content }) {
  destCache.set(destination, { content, saved_at: Date.now() });
  saveCacheToDisk();
  return JSON.stringify({ success: true, destination, ... });
}
```

**Design Intent:** 
- AI calls `cache_destination_knowledge` after doing a `web_search`
- On next conversation, the cached knowledge is injected into the system prompt
- This prevents re-searching the same destination

**Gap:** 
- Caching only works **across different conversations** (persisted to disk, loaded on restart)
- **Within the same conversation**, there's no check to see if we've already searched for this destination

### 4. TripBook Dynamic Data Tracking (models/trip-book.js)

**Lines 34-40, 85-116:**

```javascript
this.dynamic = {
  weather: {},          // { "tokyo": { city, current, forecast, _meta } }
  exchangeRates: {},    // { "JPY_CNY": { from, to, rate, last_updated, _meta } }
  flightQuotes: [],     // cached flight search results
  hotelQuotes: [],      // cached hotel search results
};
```

**Design Intent:**
- TripBook is the "single source of truth" for this session
- Weather, exchange rates, and flight/hotel quotes are tracked to avoid re-fetching
- When the system prompt is built, it includes "已缓存动态数据" sections

**Gap:**
- **web_search results are NOT tracked in TripBook's dynamic data**
- web_search calls are not persisted anywhere accessible to the agent loop
- Each round's LLM just sees the raw JSON results mixed with other messages

### 5. System Prompt Injection (buildSystemPrompt in system-prompt.js)

**Lines 106-144:**

```javascript
function buildSystemPrompt(conversationText = '', knownRates = [], knownWeather = [], tripBook = null) {
  const parts = [];
  
  // ... inject time, holidays, rates, weather, role definition, methodology ...
  
  // Inject cached destination knowledge (from dest-knowledge.js)
  const cachedDests = getAllCachedDests();  // Only from disk cache
  if (cachedDests.length > 0) {
    for (const entry of cachedDests) {
      if (!text.includes(entry.destination.toLowerCase())) continue;
      const freshLabel = daysAgo === 0 ? '今日缓存' : `${daysAgo}天前缓存`;
      parts.push(`\n---\n# 目的地知识库：${entry.destination}（${freshLabel}）\n...${entry.content}`);
    }
  }
  
  // Inject TripBook sections
  if (tripBook) {
    const tripBookSection = tripBook.toSystemPromptSection();
    ...
  }
}
```

**Design Intent:**
- "已缓存汇率、天气" sections tell the LLM which dynamic data is already known
- If cached destination knowledge exists, it's injected

**Gaps:**
- Destination cache only works **across conversations** (persisted to disk), not within a single conversation
- web_search historical calls within this conversation are NOT tracked
- No "已缓存web_search查询" section that says "You already searched for 'Turkish visa' and got 8 results"

---

## Why Duplication Happens: The Missing Link

### Scenario: Turkey Trip Planning

**Round 1:**
- User: "计划土耳其之行"
- LLM reasons: "Need to gather visa info for Turkey"
- LLM calls: `web_search "土耳其电子签证 中国护照 2026 官网 evisa.gov.tr"`
- Tool returns: `{ query: "...", results: [8 results] }`
- Message appended to history

**Round 2:**
- LLM processes: previous results + system prompt
- System prompt has no section saying "web_search for Turkish visa was already done"
- LLM sees the raw JSON with 8 results, but doesn't recognize this as cached
- LLM reasons: "I should search with slightly different keywords to be thorough"
- LLM calls: `web_search "土耳其电子签证官方网站 evisa.gov.tr 2026 中国公民"`
- Tool returns: `{ query: "...", results: [8 results] }` (essentially the same)

**Why the LLM thinks this is necessary:**
1. The first search result is not presented as "cached" or "completed"
2. Different keywords might yield different results (which is often true for web searches)
3. No explicit tracking of "web searches already performed"
4. The LLM is instructed to be thorough and cross-verify information

---

## Existing Mechanisms That Don't Prevent Duplication

### ❌ Destination Knowledge Caching
- **Intended to prevent:** Re-searching the same destination across different conversations
- **Doesn't prevent:** Duplicate searches within the same conversation
- **When loaded:** Only on service restart or new conversation
- **Limitation:** Not updated during the current conversation

### ❌ TripBook Dynamic Data
- Tracks weather, exchange rates, flight/hotel quotes
- **Does NOT track:** web_search calls
- **Why:** web_search is treated as a one-off tool, not like weather (which gets cached with TTL)

### ❌ System Prompt Instructions
```
"不再重复搜索同一目的地的基础信息"
"结果作为背景信息复用，无需重复查询"
```
- These are **aspirational instructions**, not enforced
- LLM is expected to follow them through context inference
- But context inference fails when similar-but-different search queries are possible

### ❌ Tool Result as Context
- Tool results are appended as messages, but not labeled as "cached" or "completed"
- The LLM must infer from plain text that a search has been done
- Inference fails with minor query variations

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────┐
│  LLM (OpenAI / Anthropic)                       │
└─────────────────────────┬───────────────────────┘
                          │ (system prompt + message history)
                          ▼
┌─────────────────────────────────────────────────┐
│  buildSystemPrompt()                            │
│  ├─ Include time, holidays                      │
│  ├─ Include known rates & weather (from arg)    │
│  ├─ Include cached destination knowledge        │
│  │  └─ ⚠️ Only from disk (dest-cache.json)     │
│  │  └─ NOT from current session searches       │
│  ├─ Include TripBook sections                   │
│  │  └─ "已缓存动态数据": weather, rates         │
│  │  └─ ⚠️ NO web_search tracking               │
│  └─ Include methodology & tool definitions      │
└────────────────┬────────────────────────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
    ▼                         ▼
┌──────────┐            ┌─────────────────┐
│ Round 1: │            │ Round 2:        │
│ web_search   │     │ web_search again│
│ "visa info"  │     │ "similar query" │
└──────────┘            └─────────────────┘
    │                         │
    └─────────────────────────┼─────────────────┐
                              │                 │
                              ▼                 ▼
                         ┌──────────────────────────┐
                         │ Tool Results (Raw JSON) │
                         │ Appended to messages    │
                         │ ⚠️ No dedup check      │
                         └──────────────────────────┘
```

---

## Code Evidence

### Evidence #1: No web_search Tracking in TripBook
**models/trip-book.js, lines 34-40:**
```javascript
this.dynamic = {
  weather: {},          // ✅ Tracked
  exchangeRates: {},    // ✅ Tracked
  flightQuotes: [],     // ✅ Tracked
  hotelQuotes: [],      // ✅ Tracked
  // ❌ webSearches: [] — NOT HERE!
};
```

### Evidence #2: No web_search in runTool Sync Logic
**server.js, lines 179-269 (runTool function):**
```javascript
async function runTool(funcName, funcArgs, toolId, sendSSE, tripBook) {
  const result = await executeToolCall(funcName, funcArgs);
  // ... sync to TripBook for various tools:
  
  if (funcName === 'get_exchange_rate' && parsed.rate && !parsed.error) {
    tripBook.setExchangeRate(...);  // ✅ Tracked
  }
  if (funcName === 'get_weather' && !parsed.error) {
    tripBook.setWeather(...);       // ✅ Tracked
  }
  if (funcName === 'search_flights' && Array.isArray(parsed.flights)) {
    for (const f of parsed.flights) tripBook.addFlightQuote(...);  // ✅ Tracked
  }
  if (funcName === 'search_hotels' && Array.isArray(parsed.hotels)) {
    for (const h of parsed.hotels) tripBook.addHotelQuote(...);    // ✅ Tracked
  }
  // ❌ funcName === 'web_search' — NOT HANDLED!
}
```

### Evidence #3: No Dedup Check Before Executing web_search
**server.js, line 179-269:**
```javascript
async function runTool(funcName, funcArgs, toolId, sendSSE, tripBook) {
  sendSSE('tool_start', { id: toolId, name: funcName, arguments: funcArgs });
  try {
    const result = await executeToolCall(funcName, funcArgs);
    // ❌ No check like:
    // if (tripBook.hasWebSearchBeenDone(funcArgs.query)) {
    //   return getCachedWebSearchResult(funcArgs.query);
    // }
  } catch (toolErr) {
    ...
  }
}
```

### Evidence #4: Destination Cache Only Works Across Conversations
**tools/dest-knowledge.js, lines 74-90:**
```javascript
function loadCacheFromDisk() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const entries = JSON.parse(raw);
    // Load from disk, TTL-filtered
    ...
  }
}

function initCache() {
  loadCacheFromDisk();  // Only on server startup
}
```

**system-prompt.js, lines 123-135:**
```javascript
const cachedDests = getAllCachedDests();
if (cachedDests.length > 0) {
  const hardcodedDests = ['马来西亚'];
  for (const entry of cachedDests) {
    if (hardcodedDests.includes(entry.destination)) continue;
    // ⚠️ Only checks if destination mentioned in CURRENT TEXT
    // But only for destinations cached on DISK (from previous conversations)
    if (!text.includes(entry.destination.toLowerCase())) continue;
    ...
  }
}
```

---

## Solution Options (In Order of Implementation Complexity)

### Option 1: Track web_search Calls in TripBook (SIMPLEST)
**What:** Add `webSearches[]` to TripBook's dynamic data. When web_search is executed, record the query and results. When building system prompt, include "已缓存web_search查询" section.

**Pros:**
- Minimal code changes
- Follows existing pattern for weather/rates/quotes
- Works within single conversation
- LLM gets explicit "don't re-search" signal

**Cons:**
- Only prevents duplicate if LLM reads the prompt carefully
- Still requires LLM to recognize query similarity

### Option 2: Query-Based Deduplication Before Execution (BETTER)
**What:** Before executing web_search, compute a "search intent hash" (normalize query, remove stop words, semantic matching). Check if similar search was already done. If yes, return cached result.

**Pros:**
- Prevents redundant tool calls entirely
- Faster (no unnecessary API calls)
- Works without relying on LLM judgment

**Cons:**
- Requires designing similarity matching (fuzzy, semantic, or learned)
- Risk of over-deduping and missing actual different searches

### Option 3: Conversational Search Dedup with LLM Awareness (BEST)
**What:** Combine options 1+2: Track searches in TripBook AND show in system prompt AND optionally return cached results for very similar queries.

**Pros:**
- Multi-layered defense
- Explicit + implicit dedup
- Can handle both identical and similar queries

**Cons:**
- More complex
- Needs careful tuning to avoid over-deduping

---

## Recommendation

**Implement Option 2 + Option 1:**

1. **Add web search tracking to TripBook** (5 min)
   - Add `webSearches: []` to dynamic data
   - In `runTool`, record each web_search call: `{ query, resultCount, executedAt, results }`
   
2. **Build system prompt section for cached searches** (5 min)
   - In `TripBook.buildDynamicDataPromptSection()`, add "已缓存web_search查询" section
   - Show LLM which searches were already done and how many results were found
   
3. **Implement query dedup before execution** (15 min)
   - Before `executeToolCall('web_search', ...)` in `runTool`, check:
     - Has a similar query been searched already?
     - Use simple similarity: case-insensitive substring match + keyword overlap
     - If found, return cached result instead of calling API
   
4. **Test with the Turkey scenario** (10 min)
   - Verify second visa search is detected as duplicate
   - Verify cached result is returned

---

## Summary

**Why duplicates happen:**
- LLM is not told which web_search queries have already been executed
- No deduplication check before running web_search tool
- Destination knowledge caching only works across conversations, not within

**Key findings:**
- Infrastructure exists for tracking dynamic data (weather, rates, quotes) but not web searches
- System prompt instructions are aspirational but not enforced
- Agent loop doesn't deduplicate similar but differently-worded queries

**Impact:**
- Wasted API calls (cost + latency)
- Redundant information displayed to user
- Slower overall conversation flow

