# Three Critical Gaps: Why Duplicate Web Searches Occur

## Gap #1: No Query Deduplication Check

### Current Implementation
```javascript
// server.js: runTool() function
async function runTool(funcName, funcArgs, toolId, sendSSE, tripBook) {
  sendSSE('tool_start', { id: toolId, name: funcName, arguments: funcArgs });
  try {
    // ❌ BUG: Directly executes tool with no dedup check
    const result = await executeToolCall(funcName, funcArgs);
    // ...
  }
}
```

### What Should Happen
```javascript
async function runTool(funcName, funcArgs, toolId, sendSSE, tripBook) {
  sendSSE('tool_start', { id: toolId, name: funcName, arguments: funcArgs });
  try {
    // ✅ CHECK #1: Before executing web_search, look for cached results
    if (funcName === 'web_search' && tripBook) {
      const cached = tripBook.getWebSearch(funcArgs.query);
      if (cached && isSimilarQuery(funcArgs.query, cached.originalQuery)) {
        // Return cached result, don't call API
        return JSON.stringify(cached.results);
      }
    }
    
    const result = await executeToolCall(funcName, funcArgs);
    // ...
  }
}
```

### Impact: API Calls Wasted
```
Scenario: Turkish visa search
Without dedup:
  1. web_search "土耳其电子签证 中国护照 2026" → API call ✓
  2. web_search "土耳其电子签证官方网站 evisa.gov.tr" → API call ✓ (UNNECESSARY)
  Total: 2 API calls, same results

With dedup:
  1. web_search "土耳其电子签证 中国护照 2026" → API call ✓
  2. web_search "土耳其电子签证官方网站 evisa.gov.tr" → Cached! No API call
  Total: 1 API call, same results
```

---

## Gap #2: No Web Search Tracking in TripBook

### Current State
```javascript
// models/trip-book.js
this.dynamic = {
  weather: {},           // ✅ Tracked
  exchangeRates: {},     // ✅ Tracked  
  flightQuotes: [],      // ✅ Tracked
  hotelQuotes: [],       // ✅ Tracked
  // ❌ MISSING: webSearches: []
};
```

### Server.js Tracking Logic
```javascript
// server.js: runTool() function (lines 192-260)

// ✅ Weather is tracked
if (funcName === 'get_weather' && !parsed.error) {
  tripBook.setWeather(parsed.city || '', {
    city: parsed.city, current: parsed.current, forecast: parsed.forecast,
    _meta: { fetched_at: parsed.fetched_at || Date.now(), ttl: 3 * 3600000 }
  });
}

// ✅ Exchange rates are tracked
if (funcName === 'get_exchange_rate' && parsed.rate && !parsed.error) {
  tripBook.setExchangeRate(`${parsed.from}_${parsed.to}`, {
    from: parsed.from, to: parsed.to, rate: parsed.rate,
    last_updated: parsed.last_updated,
    _meta: { fetched_at: parsed.fetched_at || Date.now(), ttl: 4 * 3600000 }
  });
}

// ❌ Web search NOT tracked!
if (funcName === 'web_search' && parsed.results) {
  // tripBook.setWebSearch(...) — THIS SHOULD BE HERE!
}
```

### What Should Be Added
```javascript
// In models/trip-book.js
this.dynamic = {
  weather: {},
  exchangeRates: {},
  flightQuotes: [],
  hotelQuotes: [],
  webSearches: [],  // ← ADD THIS
};

// Add methods:
setWebSearch(query, results) {
  this.dynamic.webSearches.push({
    originalQuery: query,
    normalizedQuery: normalizeQuery(query),
    results: results,
    executedAt: Date.now(),
    resultCount: results.length,
    _meta: { fetched_at: Date.now(), ttl: 60 * 60 * 1000 } // 1 hour TTL
  });
}

getWebSearches() {
  return this.dynamic.webSearches;
}

findSimilarWebSearch(query) {
  const normalized = normalizeQuery(query);
  for (const search of this.dynamic.webSearches) {
    if (isSimilarQuery(normalized, search.normalizedQuery)) {
      return search;
    }
  }
  return null;
}
```

### Then in server.js runTool()
```javascript
if (funcName === 'web_search' && parsed.results && tripBook) {
  tripBook.setWebSearch(funcArgs.query, parsed.results);
  sendSSE('web_search_cached', parsed);  // Notify frontend
}
```

---

## Gap #3: No "Cached Searches" Signal in System Prompt

### Current System Prompt Output
```markdown
# 行程参考书

## 已缓存动态数据

### 已缓存天气（勿重复调用 get_weather）
- 伊斯坦布尔: 18°C，晴朗（5分钟前查询，175分钟后过期）

### 已缓存汇率（勿重复调用 get_exchange_rate）
- 1 USD = 7.2 CNY（10分钟前查询）

❌ MISSING: "已缓存web_search查询" section!
❌ LLM sees no signal that visa search was already done
❌ LLM thinks: "I should search with different keywords"
```

### What Should Be Added to System Prompt
```markdown
# 行程参考书

## 已缓存动态数据

### 已缓存天气（勿重复调用 get_weather）
- 伊斯坦布尔: 18°C，晴朗（5分钟前查询，175分钟后过期）

### 已缓存汇率（勿重复调用 get_exchange_rate）
- 1 USD = 7.2 CNY（10分钟前查询）

### ✅ 已缓存web_search查询（勿重复调用）
- "土耳其电子签证 中国护照 2026": 8 results (2分钟前查询)
  主要结果涵盖: 签证政策、官方申请流程、所需文件等
  建议: 如需补充查询，请使用不同角度（如"土耳其入境要求 中国公民"）

❌ CURRENTLY MISSING! LLM doesn't see this signal.
```

### How It Works
```javascript
// models/trip-book.js: Add to buildDynamicDataPromptSection()

buildDynamicDataPromptSection() {
  const parts = [];
  
  // ... existing weather and rate sections ...
  
  // ✅ ADD THIS:
  const webSearchLines = [];
  for (const search of this.dynamic.webSearches) {
    const age = Math.round((now - search.executedAt) / 60000);
    webSearchLines.push(
      `- "${search.originalQuery}": ${search.resultCount} results ` +
      `(${age}分钟前查询)`
    );
  }
  if (webSearchLines.length > 0) {
    parts.push(
      `### 已缓存web_search查询（勿重复调用）\n` +
      webSearchLines.join('\n') +
      `\n建议：若要补充查询，请使用不同角度或关键词`
    );
  }
  
  return parts.length > 0 ? `## 已缓存动态数据\n${parts.join('\n\n')}` : '';
}
```

---

## Three-Layered Solution Architecture

```
Layer 1: TRACKING (TripBook)
┌─────────────────────────────────────────┐
│ tripBook.setWebSearch(query, results)   │
│ tripBook.getWebSearches()               │
│ tripBook.findSimilarWebSearch(query)    │
│                                         │
│ Stores: [                               │
│   {                                     │
│     originalQuery: "土耳其电子签证...",   │
│     normalizedQuery: "turkey evisa...",  │
│     results: [...],                     │
│     executedAt: timestamp,              │
│     resultCount: 8                      │
│   }                                     │
│ ]                                       │
└─────────────────────────────────────────┘
          ↑ SET (after tool execution)
          │
          │ GET (before next LLM round)
          ↓
Layer 2: SIGNALING (System Prompt)
┌─────────────────────────────────────────┐
│ buildSystemPrompt() includes section:  │
│ "已缓存web_search查询"                   │
│                                         │
│ LLM reads:                              │
│ "You already searched for Turkish visa"│
│ → "Don't search for it again"          │
│ → "If you need more info, use         │
│    different keywords"                  │
└─────────────────────────────────────────┘
          ↑ Input to LLM
          │
          │ LLM decision making
          ↓
Layer 3: EXECUTION (Dedup Check)
┌─────────────────────────────────────────┐
│ Before executeToolCall('web_search'): │
│                                         │
│ if isSimilarToExisting(query) {        │
│   return getCachedResults()            │
│ }                                       │
│ else {                                  │
│   const result = await API call        │
│   tripBook.setWebSearch(...)           │
│   return result                         │
│ }                                       │
└─────────────────────────────────────────┘
     No API call wasted!
```

---

## Comparison: Other Tools Already Have This Pattern

### Weather Tool (EXISTING - CORRECT)
```javascript
// server.js: runTool()
if (funcName === 'get_weather' && !parsed.error) {
  sendSSE('weather_cached', parsed);  // ← Send to frontend
  tripBook.setWeather(parsed.city || '', { /* ... */ });  // ← Track in TripBook
  
  // TripBook then shows in system prompt:
  // "### 已缓存天气（勿重复调用 get_weather）"
}

// system-prompt.js: buildSystemPrompt()
const weatherLines = knownWeather.map(w => 
  `- ${w.city}: 当前 ${w.current?.temp_c}°C...`
);
parts.push(`## ⚠️ 已知天气（勿重复调用 get_weather）\n${weatherLines}`);
```

### Exchange Rate Tool (EXISTING - CORRECT)
```javascript
// server.js: runTool()
if (funcName === 'get_exchange_rate' && parsed.rate && !parsed.error) {
  sendSSE('rate_cached', parsed);  // ← Send to frontend
  tripBook.setExchangeRate(`${parsed.from}_${parsed.to}`, { /* ... */ });  // ← Track
}

// system-prompt.js: buildSystemPrompt()
const rateLines = knownRates.map(r =>
  `- 1 ${r.from} = ${r.rate} ${r.to}...`
);
parts.push(`## ⚠️ 已知汇率（勿重复调用 get_exchange_rate）\n${rateLines}`);
```

### Web Search Tool (MISSING - BROKEN)
```javascript
// server.js: runTool()
if (funcName === 'web_search' && parsed.results) {
  // ❌ NO sendSSE('web_search_cached', parsed)
  // ❌ NO tripBook.setWebSearch(...)
  // Just returns raw result - no tracking!
}

// system-prompt.js: buildSystemPrompt()
// ❌ No section for web search history!
```

---

## Concrete Example: Turkey Visa Investigation

### Without Fixes
```
Round 1:
  User: "我要规划土耳其行程，需要了解签证"
  LLM: "Let me search for Turkish visa requirements"
  Tool Call: web_search "土耳其电子签证 中国护照 2026 官网 evisa.gov.tr"
  Result: { query: "...", results: [8 results including visa info] }
  ❌ NOT TRACKED IN TRIPBOOK
  ❌ NO SIGNAL IN SYSTEM PROMPT

Round 2:
  LLM: (reads system prompt + history)
    - System prompt has "已缓存天气"、"已缓存汇率"
    - System prompt has ❌ NO "已缓存web_search查询"
    - Previous tool result is raw JSON, not labeled
    - LLM thinks: "I should cross-verify with different keywords"
  
  Tool Call: web_search "土耳其电子签证官方网站 evisa.gov.tr 2026 中国公民"
  Result: { query: "...", results: [8 results, mostly same] }
  ❌ DUPLICATE! Same information, wasted API call
```

### With All Three Fixes
```
Round 1:
  User: "我要规划土耳其行程，需要了解签证"
  LLM: "Let me search for Turkish visa requirements"
  Tool Call: web_search "土耳其电子签证 中国护照 2026 官网 evisa.gov.tr"
  
  runTool execution:
    ✅ Check: tripBook.findSimilarWebSearch("...")  → null (first search)
    ✅ Execute API call
    ✅ Track: tripBook.setWebSearch(query, results)
    ✅ Signal: sendSSE('web_search_cached', ...)
  
  Result: { query: "...", results: [8 results] }

Round 2:
  LLM: (reads system prompt + history)
    - System prompt has "已缓存天气"、"已缓存汇率"
    - System prompt has ✅ "已缓存web_search查询：土耳其电子签证... (1分钟前查询)"
    - LLM thinks: "Already have Turkish visa info. Don't search again."
  
  No Tool Call for web_search!
  ✅ NO DUPLICATE! Conversation proceeds efficiently
```

---

## Implementation Checklist

### Phase 1: Tracking (Gap #2)
- [ ] Add `webSearches: []` to `TripBook.dynamic`
- [ ] Add `setWebSearch(query, results)` method to TripBook
- [ ] Add `getWebSearches()` method to TripBook
- [ ] Add `findSimilarWebSearch(query)` helper to TripBook
- [ ] In `server.js:runTool()`, add tracking for web_search

### Phase 2: Signaling (Gap #3)
- [ ] Add `buildWebSearchPromptSection()` to TripBook
- [ ] Integrate web search section into `buildDynamicDataPromptSection()`
- [ ] Test system prompt generation

### Phase 3: Dedup (Gap #1)
- [ ] Implement `normalizeQuery(query)` function
- [ ] Implement `isSimilarQuery(q1, q2)` function
- [ ] Add dedup check in `server.js:runTool()` before `executeToolCall()`
- [ ] Test query similarity matching

### Phase 4: Integration & Testing
- [ ] Test end-to-end: duplicate searches detected and cached
- [ ] Verify system prompt shows "已缓存web_search查询"
- [ ] Test with multiple scenarios (visa, weather, prices, etc.)
- [ ] Monitor API call reduction

---

## Estimated Time to Fix

- Phase 1 (Tracking): 5-10 minutes
- Phase 2 (Signaling): 5 minutes
- Phase 3 (Dedup): 10-15 minutes
- Phase 4 (Testing): 10 minutes

**Total: 30-40 minutes** to fully implement and test all three layers.

