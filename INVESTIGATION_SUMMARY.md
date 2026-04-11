# Investigation: Duplicate Web Search Calls

## Quick Reference: The Root Cause

**The LLM is making duplicate web_search calls because:**

1. ❌ **No deduplication check exists** before executing web_search
2. ❌ **Web search results are not tracked in TripBook** (unlike weather, rates, flights, hotels)
3. ❌ **No "cached web_search" section in system prompt** to tell LLM what's been searched already
4. ❌ **Query similarity detection is missing** - even identical queries would execute twice

---

## Key Code Locations

| What | Where | Status |
|------|-------|--------|
| **Agent loop (tool execution)** | `server.js:644-801` | ✅ Executes tools but no dedup |
| **Tool execution hub** | `server.js:179-269 (runTool)` | ❌ No web_search tracking |
| **System prompt builder** | `prompts/system-prompt.js:11-147` | ⚠️ No web_search cache section |
| **TripBook dynamic data** | `models/trip-book.js:34-40` | ❌ No webSearches array |
| **TripBook prompt section** | `models/trip-book.js:317-353 (buildDynamicDataPromptSection)` | ⚠️ Only weather/rates, no searches |
| **Destination cache** | `tools/dest-knowledge.js:1-111` | ⚠️ Disk-only, not conversation-level |

---

## How It Should Work (Desired Flow)

```
User: "计划土耳其之行"
       ↓
LLM: "I need visa info for Turkey"
       ↓
1️⃣  Call: web_search("土耳其电子签证 中国护照 2026")
    runTool('web_search', ...) 
      → tripBook.addWebSearch({ query, results })  ← CURRENTLY MISSING!
      → Send tool result
       ↓
LLM reads: system prompt + "已缓存web_search查询: [Turkish visa search]"
LLM: "I already have Turkish visa info"
       ↓
2️⃣  Call: web_search("土耳其电子签证官方网站...")  ← DETECTED AS DUPLICATE ✅
    runTool('web_search', ...) 
      → Check: tripBook.hasWebSearchDone("土耳其电子签证")
      → YES! Similar query already executed
      → Return cached results instead of calling API ✅
```

---

## Current Flow (Why Duplicates Happen)

```
User: "计划土耳其之行"
       ↓
LLM: "I need visa info for Turkey"
       ↓
1️⃣  Call: web_search("土耳其电子签证 中国护照 2026")
    runTool('web_search', ...) 
      → executeToolCall('web_search', ...)  [API call made]
      → resultStr = JSON with 8 results
      → ❌ NO TRACKING - results not saved to TripBook
      → Send tool result (raw JSON) to messages
       ↓
LLM reads: messages history + system prompt
    - System prompt has NO section saying "web_search for Turkish visa done"
    - Tool result is just plain JSON, not labeled as "cached"
    - LLM sees message history is cluttered
       ↓
LLM: "I should search with different keywords to be thorough"
       ↓
2️⃣  Call: web_search("土耳其电子签证官方网站 evisa.gov.tr 2026")
    runTool('web_search', ...) 
      → ❌ NO DEDUP CHECK - proceeds to API call
      → executeToolCall('web_search', ...)  [API call made again]
      → resultStr = JSON with 8 results (essentially same as #1)
      → ❌ NO TRACKING - results not saved
      → Send tool result
       ↓
❌ DUPLICATE! Same information returned twice.
```

---

## Evidence: Code Gaps

### Gap #1: No web_search Tracking in runTool
**File:** `server.js:192-260`

Current code tracks these:
```javascript
// ✅ Tracks exchange rate
if (funcName === 'get_exchange_rate' && parsed.rate && !parsed.error) {
  tripBook.setExchangeRate(`${parsed.from}_${parsed.to}`, { ... });
}

// ✅ Tracks weather
if (funcName === 'get_weather' && !parsed.error) {
  tripBook.setWeather(parsed.city || '', { ... });
}

// ✅ Tracks flight quotes
if (funcName === 'search_flights' && Array.isArray(parsed.flights)) {
  for (const f of parsed.flights) {
    tripBook.addFlightQuote({ ... });
  }
}

// ❌ MISSING: No tracking for web_search!
// if (funcName === 'web_search') { tripBook.addWebSearch(...) }
```

### Gap #2: TripBook Has No webSearches Array
**File:** `models/trip-book.js:34-40`

```javascript
this.dynamic = {
  weather: {},          // ✅ Weather tracked here
  exchangeRates: {},    // ✅ Exchange rates tracked
  flightQuotes: [],     // ✅ Flight quotes tracked
  hotelQuotes: [],      // ✅ Hotel quotes tracked
  // ❌ MISSING: webSearches: [] — no web search storage!
};
```

### Gap #3: No System Prompt Section for Cached Searches
**File:** `models/trip-book.js:317-353 (buildDynamicDataPromptSection)`

Current output:
```javascript
### 已缓存天气（勿重复调用 get_weather）     // ✅ Weather warning
- 伊斯坦布尔: 18°C，晴朗

### 已缓存汇率（勿重复调用 get_exchange_rate）  // ✅ Exchange rate warning
- 1 USD = 0.95 CNY

// ❌ MISSING: "已缓存web_search查询" section!
// 应该有类似：
// ### 已缓存web_search查询
// - "土耳其电子签证 中国护照 2026" → 8 results (10分钟前查询)
```

### Gap #4: No Dedup Check Before Execution
**File:** `server.js:179-269 (runTool function)**

```javascript
async function runTool(funcName, funcArgs, toolId, sendSSE, tripBook) {
  sendSSE('tool_start', { id: toolId, name: funcName, arguments: funcArgs });
  try {
    // ❌ NO DEDUP CHECK HERE!
    // Should have something like:
    // if (funcName === 'web_search') {
    //   const cached = tripBook.getWebSearchResult(funcArgs.query);
    //   if (cached && isSimilarQuery(funcArgs.query, cached.query)) {
    //     return cached.results;  // Return cached, don't call API
    //   }
    // }
    
    const result = await executeToolCall(funcName, funcArgs);
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    
    // ... existing tracking for other tools ...
    
    // ❌ NO TRACKING for web_search:
    if (funcName === 'web_search' && /* parsed.results */) {
      // tripBook.addWebSearch(/* ... */) — MISSING!
    }
    
    return resultStr;
  } catch (toolErr) { ... }
}
```

### Gap #5: Destination Cache Only Works Across Sessions
**File:** `tools/dest-knowledge.js` and `prompts/system-prompt.js:123-135`

```javascript
// dest-knowledge.js: Only loads cache on server startup
function initCache() {
  loadCacheFromDisk();  // ← Only called once when server starts
}

// system-prompt.js: Cached destinations only from disk, not from current session
const cachedDests = getAllCachedDests();  // ← Loads from memory, which was only populated at startup
if (cachedDests.length > 0) {
  for (const entry of cachedDests) {
    // ... inject into system prompt ...
  }
}

// ❌ Problem: If AI calls cache_destination_knowledge() during conversation,
//    it's added to memory but won't appear in system prompt until next conversation!
```

---

## Message Flow in Agent Loop

### OpenAI Agent Loop (server.js:659-738)

```javascript
for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
  // Step 1: Call LLM with current conversation state
  const stream = await client.chat.completions.create({
    model: selectedModel,
    messages,  // ← Includes system prompt + all previous messages
    tools,     // ← Tool definitions (just specifications)
    tool_choice: 'auto',
    temperature: 0.7,
    max_tokens: 4096,
    stream: true,
  });

  // Step 2: Collect tool calls from stream
  let fullText = '';
  const toolCallsMap = {};
  for await (const chunk of stream) {
    // ... accumulate tokens and tool calls ...
  }

  // Step 3: Execute tool calls
  const toolCalls = Object.values(toolCallsMap);
  if (toolCalls.length > 0) {
    // Append AI's response with tool calls
    messages.push({
      role: 'assistant',
      content: fullText || null,
      tool_calls: toolCalls.map(tc => ({...}))
    });

    // Execute each tool call
    for (const toolCall of toolCalls) {
      const funcName = toolCall.function.name;
      const funcArgs = JSON.parse(toolCall.function.arguments);
      
      // ← runTool() is called here (where tracking SHOULD happen)
      const resultStr = await runTool(funcName, funcArgs, toolCall.id, sendSSE, tripBook);
      
      // Append tool result
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: resultStr
      });
    }
    continue;  // ← Loop back to call LLM again with new messages
  }

  // Step 4: No more tool calls, return response
  return fullText;
}
```

**Key Issue:** Between rounds, `messages` array grows but:
- ✅ LLM can read previous messages
- ✅ LLM sees tool results as JSON
- ❌ LLM doesn't get structured "which tools were called" summary
- ❌ No "cached searches" signal in system prompt

---

## What the LLM Actually Sees

### System Prompt (rebuilt each round)
```markdown
# 当前时间
现在是 2026年4月11日 星期五 14:30

# 节假日安排
...

## ⚠️ 已知汇率（勿重复调用 get_exchange_rate）
- 1 USD = 7.2 CNY (2分钟前查询)

## ⚠️ 已知天气（勿重复调用 get_weather）
- 伊斯坦布尔: 18°C，晴朗 (5分钟前查询)

# 工具使用策略
...
- **同一城市天气在本次对话中只需查询一次**
- **同一货币对汇率在本次对话中只需查询一次**
- 当用户提到一个目的地...需要：
  1. 并行调用 web_search...（2-3次搜索即可覆盖）
  ...
  3. 之后直接使用缓存内容，**不再重复搜索同一目的地的基础信息**
# 行程参考书
## 已缓存动态数据
### 已缓存天气
- 伊斯坦布尔: 18°C，晴朗（5分钟前查询，175分钟后过期）

### 已缓存汇率
- 1 USD = 7.2 CNY（10分钟前查询）

# ❌ MISSING: 已缓存web_search查询 SECTION!
# 应该显示:
# ### 已缓存web_search查询（勿重复调用）
# - "土耳其电子签证 中国护照 2026" → 8 results (已获取，勿重复搜索)
```

### Message History (What LLM Sees)
```
[system: <system prompt above>]

[user: "我要规划一次土耳其之行，想知道签证要求"]

[assistant: "我来帮您规划土耳其之行..."]
[tool: web_search - 土耳其电子签证 中国护照 2026
  Result: {
    "query": "土耳其电子签证 中国护照 2026 官网 evisa.gov.tr",
    "results": [
      { "title": "Turkish eVisa Official Site", "url": "...", "snippet": "..." },
      { "title": "中国护照土耳其签证", "url": "...", "snippet": "..." },
      ...
      { "title": "..." }  // 8 results total
    ]
  }
]

[assistant: "我已获得土耳其电子签证的信息..."]
[tool: search_flights - ...]
[tool: get_exchange_rate - USD -> CNY]
[tool: get_weather - Istanbul]

# 现在 LLM 要决定下一步...
# ❌ System prompt has NO section saying "web_search for Turkish visa was done"
# ✅ System prompt HAS "已缓存天气" and "已缓存汇率" sections
# ❌ Raw JSON result from web_search is not labeled as "cached"
# 
# LLM reasoning: "I should cross-verify with another search with different keywords"
# → Calls web_search again with "土耳其电子签证官方网站 evisa.gov.tr 2026 中国公民"
# → Duplicate!
```

---

## Impact Analysis

| Metric | Impact |
|--------|--------|
| **API Calls** | 2x for Turkish visa info (unnecessary duplicate) |
| **Cost** | Wasted API calls (Bing search + processing) |
| **Latency** | Extra 2-5 seconds per duplicate search |
| **User Experience** | Sees same information twice, appears redundant |
| **Scalability** | At scale, N conversations × D duplicates per conversation = significant waste |

---

## Why Existing Systems Don't Prevent This

| System | Purpose | Why It Fails |
|--------|---------|-------------|
| **dest-knowledge.js cache** | Prevent re-searches across conversations | Only loads on server startup; not updated during conversation |
| **TripBook dynamic data** | Track weather, rates, quotes | web_search results not tracked (array doesn't exist) |
| **System prompt instructions** | Tell LLM to avoid duplicates | Only aspirational; not enforced; LLM infers from context |
| **Message history** | Provide context to LLM | Tool results are raw JSON, not labeled as "cached" or "completed" |

---

## Solution Roadmap

### Phase 1: Add Web Search Tracking (5 min)
1. Add `webSearches: []` to `TripBook.dynamic`
2. Add `setWebSearch(query, results)` method to TripBook
3. Call `tripBook.setWebSearch()` in `runTool()` when web_search executes

### Phase 2: System Prompt Integration (5 min)
1. Add `buildWebSearchPromptSection()` method to TripBook
2. Include web search history in system prompt: "已缓存web_search查询"
3. LLM will see list of searches already done

### Phase 3: Query Deduplication (15 min)
1. Implement `normalizeQuery(query)` function
   - Lowercase, remove punctuation, remove stop words
   - Compute keyword similarity
2. Before executing web_search:
   - Check if similar query was already done
   - If yes, return cached results instead
3. Add dedup logic to `runTool()` before `executeToolCall()`

### Phase 4: Testing (10 min)
1. Create test scenario: Turkey visa search
2. Verify second search is detected as duplicate
3. Verify cached results returned
4. Monitor performance improvement

---

## Files to Modify

```
Phase 1:
  models/trip-book.js
    - Add webSearches: [] to dynamic
    - Add setWebSearch(query, results) method
    - Add getWebSearches() method
  
  server.js (runTool function)
    - Add tracking when funcName === 'web_search'
    - Call tripBook.setWebSearch(funcArgs.query, parsed.results)

Phase 2:
  models/trip-book.js
    - Add buildWebSearchPromptSection() method
  
  prompts/system-prompt.js
    - Include web search section in buildSystemPrompt

Phase 3:
  tools/web-search.js or new file: query-dedup.js
    - Add normalizeQuery() function
    - Add getQuerySimilarity() function
  
  server.js (runTool function)
    - Add dedup check before executeToolCall('web_search')

Phase 4:
  test/web-search-dedup.test.js
    - Unit tests for query similarity
    - Integration tests for dedup flow
```

---

## Files Analyzed

This investigation read and analyzed:

1. ✅ `server.js` - Agent loops, tool execution, system prompt building
2. ✅ `prompts/system-prompt.js` - System prompt assembly
3. ✅ `prompts/knowledge/methodology.js` - Methodology instructions
4. ✅ `tools/web-search.js` - Web search tool definition
5. ✅ `tools/dest-knowledge.js` - Destination caching
6. ✅ `tools/update-trip-info.js` - Trip info tracking
7. ✅ `tools/index.js` - Tool registry
8. ✅ `models/trip-book.js` - TripBook data model

All relevant code paths have been identified and documented above.

---

## Conclusion

The duplicate web_search issue stems from:
1. **Missing architectural component**: Web search results aren't tracked in TripBook (unlike weather, rates, quotes)
2. **Missing prompt signal**: No "already cached" indicator shown to LLM
3. **Missing dedup logic**: No query similarity check before execution
4. **Aspirational instructions**: System prompt says "don't repeat searches" but doesn't enforce it

**Solution**: Implement tracked storage + prompt signal + query dedup (15-25 min total implementation).

