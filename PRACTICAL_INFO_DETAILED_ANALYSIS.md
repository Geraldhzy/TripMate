# "实用信息" (Practical Info) - Complete Data Flow Analysis

## Quick Reference

### What is "实用信息"?
The travel planner displays practical information to users in a section called **"📚 行前准备 & 实用信息"** (Pre-trip Preparation & Practical Info). This includes:

| Category | Icon | Where It Comes From | Backend Field | Frontend State |
|----------|------|---------------------|-------------------|-------------------|
| Pre-trip Checklist | 📝 | AI updates via `update_trip_info` | `itinerary.reminders` | `reminders` |
| Exchange Rates | 💱 | `get_exchange_rate` tool | `dynamic.exchangeRates` | `exchangeRates` |
| Visa Info | 🛂 | `web_search` (visa-related) | `dynamic.webSearches` | `webSearchSummaries` (filtered) |
| Practical Info | 🔍 | `web_search` (non-visa) | `dynamic.webSearches` | `webSearchSummaries` (filtered) |
| Special Requests | ⚠️ | User input via `update_trip_info` | `constraints.specialRequests` | `specialRequests` |
| Weather Forecast | 🌤️ | `get_weather` tool | `dynamic.weather` | `weather`/`weatherList` |
| Destination KB | (injected) | `cache_destination_knowledge` | `prompts/knowledge/dest-*.js` | (Not directly displayed, used for AI context) |

---

## Part 1: Backend Storage (TripBook Model)

### File: `models/trip-book.js`

**Three-Layer Architecture:**

```javascript
class TripBook {
  // Layer 1: Dynamic Data (Cached Results)
  dynamic: {
    knowledge: {},              // { "日本": {...} }
    weather: {},                // { "tokyo": { city, current, forecast, _meta } }
    exchangeRates: {},          // { "JPY_CNY": { from, to, rate, last_updated } }
    webSearches: [],            // [{ query, summary, fetched_at }]
    flightQuotes: [],
    hotelQuotes: []
  }

  // Layer 2: User Constraints
  constraints: {
    destination, departCity, dates, people, budget, preferences,
    specialRequests: [          // [{ type, value, confirmed }]
    ]
  }

  // Layer 3: Structured Itinerary
  itinerary: {
    phase, phaseLabel, route, days,
    budgetSummary,
    reminders: [                // ["出发前3天完成Visit Japan Web注册", ...]
    ]
  }
}
```

### Key Methods for Practical Info:

| Method | Line | What It Does | Practical Info Use |
|--------|------|--------------|---------------------|
| `addWebSearch(entry)` | 103 | Records web search results (no duplicates) | Stores visa info + practical tips |
| `setExchangeRate(key, data)` | 82 | Stores currency exchange rates | Used in 💱 tab |
| `updateItinerary(delta)` | 198 | Updates itinerary, including reminders | Line 233-237: `delta.reminders → itinerary.reminders` |
| `toPanelData()` | 430 | **CONVERTS TO FRONTEND FORMAT** | All practical info extracted here |
| `toJSON()` | 512 | Serializes for persistence | Complete snapshot with all practical info |

### The Critical Export: `toPanelData()` (lines 430-506)

```javascript
toPanelData() {
  return {
    // ... basic info ...
    
    // PRACTICAL INFO FIELDS
    reminders: it.reminders || [],              // Line 495
    exchangeRates: Object.values(this.dynamic.exchangeRates).map(r => ({
      from: r.from, to: r.to, rate: r.rate, last_updated: r.last_updated,
    })),                                        // Lines 496-498
    
    webSearchSummaries: this.dynamic.webSearches.map(s => ({
      query: s.query, summary: s.summary || '', fetched_at: s.fetched_at,
    })),                                        // Lines 499-501
    
    specialRequests: (c.specialRequests || []).map(r => ({
      type: r.type, value: r.value, confirmed: r.confirmed,
    })),                                        // Lines 502-504
    
    _snapshot: tripBook.toJSON()  // Complete state for persistence (line 378)
  }
}
```

---

## Part 2: Destination Knowledge Cache

### File: `tools/dest-knowledge.js`

**Tool Definition (lines 19-41):**
```javascript
{
  name: 'cache_destination_knowledge',
  parameters: {
    destination: "日本" or "日本-东京",  // Country or Country-City
    content: "Markdown content..."  // Structured knowledge
  }
}
```

**Two-Level Cache Structure:**

1. **National Level** (e.g., "日本")
   - 签证政策 (Visa policies)
   - 货币与支付 (Currency & payment)
   - 语言 (Language)
   - 时区 (Time zone)
   - 电压 (Electrical voltage)
   - 入境注意事项 (Entry requirements)
   - 实用信息 (Practical tips)

2. **City Level** (e.g., "日本-东京")
   - 机场交通 (Airport transport)
   - 市内交通 (Local transit)
   - 区域特点 (Neighborhoods)
   - 实用App (Useful apps)
   - 城市间交通 (Inter-city transport)

**Example File Format** (`prompts/knowledge/dest-日本.js`):
```javascript
module.exports = {
  destination: '日本',
  saved_at: 1775815481672,
  content: `# 日本旅游知识库

## 签证政策（中国护照）
- 签证类型：需提前申请日本旅游签证
- 停留期限：15-30天

## 货币与支付
- 官方货币：日元（JPY）
- 汇率参考：1 CNY ≈ 23.24 JPY
...
`
};
```

**Cache Persistence:**
- **In Memory:** `destCache` Map
- **On Disk:** `prompts/knowledge/dest-{destination}.js`
- **TTL:** 30 days

**Init Flow (lines 161-165):**
```
migrateLegacyCache() → loadFromFiles() → destCache populated
```

---

## Part 3: System Prompt Injection

### File: `prompts/system-prompt.js`

**How Practical Info Influences AI:**

1. **Destination Knowledge Injection (lines 183-194):**
   ```javascript
   const cachedDests = getAllCachedDests();
   for (const entry of cachedDests) {
     if (!text.includes(entry.destination.toLowerCase())) continue;
     // Inject: "# 目的地知识库：{destination}（{freshness}）\n{content}"
   }
   ```
   - Only injects if destination mentioned in conversation
   - Includes freshness label (今日缓存 / X days ago)

2. **TripBook System Section (lines 196-206):**
   ```javascript
   const tripBookSection = tripBook.toSystemPromptSection();
   // Returns three subsections:
   // - 已缓存动态数据 (cached weather, rates, searches)
   // - 用户已确认信息 (confirmed constraints)
   // - 当前行程进度 (selected flights/hotels, budget)
   ```

**AI Tool References (lines 125-131):**
- `cache_destination_knowledge` — Save destination knowledge
- `update_trip_info` — Update reminders and itinerary
- `web_search` — Search practical info
- `get_exchange_rate` — Query exchange rates
- `get_weather` — Get weather forecast

---

## Part 4: Server API & SSE Streaming

### File: `server.js`

**Route:** `POST /api/chat` (lines 116-203)

**Practical Info Flow:**

1. **Client Request (lines 117, 152):**
   ```javascript
   {
     messages: [...],
     provider, model,
     tripBookSnapshot: { constraints, itinerary, dynamic }  // Restored state
   }
   ```

2. **Server Restoration (lines 158-168):**
   ```javascript
   if (tripBookSnapshot) {
     if (tripBookSnapshot.constraints) tripBook.updateConstraints(...);
     if (tripBookSnapshot.itinerary) tripBook.updateItinerary(...);
   }
   ```

3. **Tool Execution & Sync:**
   - **web_search** (line 360): `tripBook.addWebSearch({ query, summary })`
   - **cache_destination_knowledge** (lines 348-349): `tripBook.addKnowledgeRef(destination)`
   - **update_trip_info** (lines 364-380): Syncs constraints/itinerary/reminders

4. **SSE Event: tripbook_update (lines 376-379):**
   ```javascript
   sendSSE('tripbook_update', {
     ...tripBook.toPanelData(),    // All practical info fields
     _snapshot: tripBook.toJSON()  // Complete state for persistence
   });
   ```

---

## Part 5: Frontend Reception & Storage

### File: `public/js/chat.js`

**SSE Event Handler (lines 303-312):**
```javascript
case 'tripbook_update': {
  const snapshot = data._snapshot;
  if (snapshot) {
    sessionStorage.setItem('tp_tripbook_snapshot', JSON.stringify(snapshot));
    sessionStorage.setItem('tp_tripbook', JSON.stringify(snapshot));
  }
  if (typeof updateFromTripBook === 'function') {
    updateFromTripBook(data);  // Call itinerary.js to update state
  }
}
```

**Persistent Storage:**
- **Current Session:** `sessionStorage.tp_tripbook_snapshot` (complete JSON)
- **Trip History:** `localStorage.tp_trips[].tripBookSnapshot` (persisted across browser sessions)

**Trip Save Flow (lines 606-640):**
```javascript
function saveCurrentTrip() {
  let tripBookSnapshot = {};
  const stored = sessionStorage.getItem('tp_tripbook_snapshot') 
              || sessionStorage.getItem('tp_tripbook');
  if (stored) tripBookSnapshot = JSON.parse(stored);
  
  trips[idx].tripBookSnapshot = tripBookSnapshot;  // ← Save practical info
  saveTrips(trips);
}
```

---

## Part 6: Frontend Rendering

### File: `public/js/itinerary.js`

**Frontend State (lines 4-26):**
```javascript
let itineraryState = {
  // ... basic info ...
  
  // PRACTICAL INFO FIELDS
  reminders: [],              // 行前清单
  exchangeRates: [],          // 汇率
  webSearchSummaries: [],     // Web搜索结果
  specialRequests: [],        // 特殊需求
}
```

**State Update Function (lines 159-215):**
```javascript
function updateFromTripBook(data) {
  if (data.reminders) itineraryState.reminders = data.reminders;
  if (data.exchangeRates) itineraryState.exchangeRates = data.exchangeRates;
  if (data.webSearchSummaries) itineraryState.webSearchSummaries = data.webSearchSummaries;
  if (data.specialRequests) itineraryState.specialRequests = data.specialRequests;
  renderPanel();  // Re-render UI
}
```

### Rendering: `renderSectionPrepAndInfo()` (lines 483-576)

**Section Structure:**
```
📚 行前准备 & 实用信息
├─ 🌤️ 天气预报
│  └─ City name, temperature, description (translated)
│
├─ 🛂 签证信息
│  └─ Visa-related web search results (filtered by /签证|visa|入境|护照|免签/i)
│
├─ 💱 汇率
│  └─ "1 JPY = 0.043 CNY" format
│
├─ 🔍 实用信息          ← LABELED "实用信息"
│  └─ Non-visa web search results
│
├─ ⚠️ 特殊需求
│  └─ Special requirements from constraints
│
└─ 📝 行前清单
   ├─ ☐ 出发前3天完成Visit Japan Web注册
   ├─ ☐ 准备护照、签证、机票行程单
   ├─ ☐ ...
   └─ Interactive: click to check off
```

**Rendering Code Breakdown:**

1. **Weather (lines 497-509):**
   ```javascript
   const weatherItems = s.weatherList || (s.weather ? [s.weather] : []);
   for (const w of weatherItems) {
     const cityName = translateCity(w.city);
     html += `<div class="prep-card">
       <div class="prep-card-title">📍 ${cityName}</div>
       <div class="prep-card-body">${w.temp_c}°C，${translateWeather(w.description)}</div>
     </div>`;
   }
   ```

2. **Visa Info (lines 511-521):**
   ```javascript
   const visaSearches = s.webSearchSummaries.filter(
     w => /签证|visa|入境|护照|免签/i.test(w.query)
   );
   for (const v of visaSearches) {
     html += `<div class="prep-card">
       <div class="prep-card-title">${v.query}</div>
       <div class="prep-card-body">${v.summary}</div>
     </div>`;
   }
   ```

3. **Exchange Rates (lines 523-533):**
   ```javascript
   for (const r of s.exchangeRates) {
     html += `<div class="rate-card">
       1 ${r.from} = ${r.rate} ${r.to}
       <small>${r.last_updated || ''}</small>
     </div>`;
   }
   ```

4. **Practical Info (lines 535-545):**
   ```javascript
   const infoSearches = s.webSearchSummaries.filter(
     w => !/签证|visa|入境|护照|免签/i.test(w.query)
   );
   for (const info of infoSearches) {
     html += `<div class="info-card">
       <div class="info-card-title">${info.query}</div>
       <div class="info-card-body">${info.summary}</div>
     </div>`;
   }
   ```

5. **Special Requests (lines 547-557):**
   ```javascript
   for (const req of s.specialRequests) {
     html += `<div class="prep-card">
       <div class="prep-card-title">${req.type || '需求'}</div>
       <div class="prep-card-body">${req.value}</div>
     </div>`;
   }
   ```

6. **Reminders/Checklist (lines 559-570):**
   ```javascript
   if (s.reminders.length > 0) {
     html += '<ul class="reminder-list">';
     for (let i = 0; i < s.reminders.length; i++) {
       html += `<li class="reminder-item">
         <span class="reminder-check" onclick="toggleReminder(this)"></span>
         <span>${s.reminders[i]}</span>
       </li>`;
     }
     html += '</ul>';
   }
   ```

---

## Part 7: Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ AI LLM (Claude/GPT/DeepSeek)                                    │
│                                                                  │
│ 1. Generates travel plan                                        │
│    - Calls cache_destination_knowledge("日本", "签证...")       │
│    - Calls web_search("日本电源插座")                          │
│    - Calls get_exchange_rate("JPY_CNY")                        │
│    - Calls get_weather("Tokyo", start_date, end_date)         │
│    - Calls update_trip_info({                                  │
│        reminders: ["出发前3天完成...", ...],                   │
│        itinerary: { days: [...], route: [...] }                │
│      })                                                          │
└────────────────────────┬────────────────────────────────────────┘
                        │ Tool Calls
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ SERVER.JS - Tool Execution & Data Sync                          │
│                                                                  │
│ 2a. cache_destination_knowledge                                │
│     └─ dest-knowledge.js:execute()                            │
│        ├─ Save to memory: destCache.set("日本", {...})        │
│        └─ Persist: prompts/knowledge/dest-日本.js             │
│                                                                 │
│ 2b. web_search("日本电源插座")                                 │
│     └─ tripBook.addWebSearch({                                │
│        query: "日本电源插座",                                 │
│        summary: "...",                                        │
│        fetched_at: Date.now()                                │
│      })                                                        │
│        └─ Stored in: dynamic.webSearches[]                   │
│                                                                 │
│ 2c. get_exchange_rate("JPY_CNY")                              │
│     └─ tripBook.setExchangeRate("JPY_CNY", {                 │
│        from: "JPY", to: "CNY", rate: 0.043, ...             │
│      })                                                        │
│        └─ Stored in: dynamic.exchangeRates                   │
│                                                                 │
│ 2d. get_weather("Tokyo", ...)                                 │
│     └─ tripBook.setWeather("tokyo", {                        │
│        city, current: { temp_c, description }, ...           │
│      })                                                        │
│        └─ Stored in: dynamic.weather                         │
│                                                                 │
│ 2e. update_trip_info({...})                                   │
│     └─ tripBook.updateItinerary({                            │
│        reminders: ["出发前3天...", ...],                      │
│        days: [...], route: [...]                             │
│      })                                                        │
│        ├─ itinerary.reminders = delta.reminders              │
│        ├─ itinerary.days = delta.days                        │
│        └─ itinerary.route = delta.route                      │
│                                                                 │
│ 3. After update_trip_info:                                     │
│    tripBook.toPanelData() → Convert to frontend format        │
│                                                                 │
│    Send SSE Event:                                            │
│    sendSSE('tripbook_update', {                               │
│      reminders: [...],         // Line 495                    │
│      exchangeRates: [...],     // Lines 496-498               │
│      webSearchSummaries: [     // Lines 499-501               │
│        { query, summary, fetched_at }, ...                    │
│      ],                                                        │
│      specialRequests: [...],   // Lines 502-504               │
│      weather: {...},                                          │
│      weatherList: [...],                                      │
│      _snapshot: tripBook.toJSON()  // Complete state          │
│    })                                                          │
└────────────────────────┬────────────────────────────────────────┘
                        │ SSE Event Stream
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ BROWSER - chat.js                                               │
│                                                                  │
│ 4. Receive 'tripbook_update' event (lines 303-312)            │
│                                                                 │
│    const snapshot = data._snapshot;                            │
│    sessionStorage.setItem('tp_tripbook_snapshot',              │
│      JSON.stringify(snapshot)  // Save complete state          │
│    );                                                          │
│                                                                 │
│    // Transfer to itinerary.js for rendering                  │
│    updateFromTripBook(data);  // Function in itinerary.js     │
└────────────────────────┬────────────────────────────────────────┘
                        │ Function Call
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ BROWSER - itinerary.js                                          │
│                                                                  │
│ 5. State Update (lines 159-215)                                │
│                                                                 │
│    itineraryState.reminders = data.reminders;                 │
│    itineraryState.exchangeRates = data.exchangeRates;         │
│    itineraryState.webSearchSummaries = data.webSearchSummaries;
│    itineraryState.specialRequests = data.specialRequests;     │
│    itineraryState.weather = data.weather;                     │
│    itineraryState.weatherList = data.weatherList;             │
│                                                                 │
│    renderPanel();  // Trigger re-render                        │
└────────────────────────┬────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ BROWSER - UI Render (lines 220-261)                            │
│                                                                  │
│ 6. renderPanel() calls:                                         │
│    ├─ renderSectionHeader()                                   │
│    ├─ renderSectionItinerary()                                │
│    ├─ renderSectionTransport()                                │
│    ├─ renderSectionHotel()                                    │
│    ├─ renderSectionFoodAndAttraction()                        │
│    ├─ renderSectionBudget()                                   │
│    └─ renderSectionPrepAndInfo()  ← PRACTICAL INFO RENDERED   │
│       (lines 483-576)                                         │
└────────────────────────┬────────────────────────────────────────┘
                        │ HTML Generation
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ BROWSER UI Display                                              │
│                                                                  │
│ 📚 行前准备 & 实用信息                                           │
│ ├─ 🌤️ 天气预报                                                │
│ │  └─ 📍 东京: 15°C，多云                                     │
│ │  └─ 📍 京都: 12°C，小雨                                     │
│ │                                                               │
│ ├─ 🛂 签证信息                                                │
│ │  └─ 日本签证办理流程 → [Summary content]                   │
│ │  └─ 中国护照免签国家最新政策 → [Summary content]           │
│ │                                                               │
│ ├─ 💱 汇率                                                    │
│ │  └─ 1 JPY = 0.043022 CNY                                   │
│ │  └─ 1 USD = 7.25 CNY                                       │
│ │                                                               │
│ ├─ 🔍 实用信息        ← LABELED AS "实用信息"                │
│ │  └─ 日本电源插座标准 → [Summary: Type A plugs...]          │
│ │  └─ 东京地铁票价 → [Summary: Start from ¥170...]          │
│ │  └─ 日本便利店餐饮 → [Summary: Convenient & cheap...]     │
│ │                                                               │
│ ├─ ⚠️ 特殊需求                                                │
│ │  └─ 无障碍: 需要轮椅通道                                     │
│ │                                                               │
│ └─ 📝 行前清单                                                │
│    ├─ ☐ 出发前3天完成Visit Japan Web注册                    │
│    ├─ ☐ 准备护照、签证、机票行程单                           │
│    ├─ ☐ 购买国际旅行保险                                     │
│    ├─ ☐ 准备旅行适配器（日本100V电压）                      │
│    ├─ ☐ 下载离线地图和翻译App                               │
│    └─ ☐ 兑换日元现金                                         │
│       (User can click to mark complete)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 8: Quick Reference Tables

### Practical Info Data Sources

| Type | Tool | Trigger | Backend Field | Frontend Field |
|------|------|---------|----------------|-----------------|
| Checklist | `update_trip_info` | AI at planning end | `itinerary.reminders` | `reminders` |
| Exchange Rate | `get_exchange_rate` | AI needs currency | `dynamic.exchangeRates` | `exchangeRates` |
| Visa Info | `web_search` | AI searches visa | `dynamic.webSearches` | `webSearchSummaries` (filtered) |
| Practical Tips | `web_search` | AI searches local info | `dynamic.webSearches` | `webSearchSummaries` (filtered) |
| Special Needs | `update_trip_info` | User specifies | `constraints.specialRequests` | `specialRequests` |
| Weather | `get_weather` | AI needs forecast | `dynamic.weather` | `weather`/`weatherList` |
| Dest Knowledge | `cache_destination_knowledge` | New destination | `prompts/knowledge/dest-*.js` | (System prompt only) |

### Key File Locations

| Component | File | Key Lines |
|-----------|------|-----------|
| Data Model | `models/trip-book.js` | 22-58 (structure), 430-506 (export) |
| Destination Cache | `tools/dest-knowledge.js` | 19-41 (tool def), 43-50 (execute), 161-165 (init) |
| System Prompt | `prompts/system-prompt.js` | 183-194 (dest KB injection), 196-206 (TripBook) |
| Server API | `server.js` | 116-203 (endpoint), 256-402 (tool exec), 376-379 (SSE) |
| Frontend Handler | `public/js/chat.js` | 145-152 (request), 303-312 (SSE handler), 606-640 (persist) |
| Frontend UI | `public/js/itinerary.js` | 4-26 (state), 159-215 (update), 483-576 (render) |

### API Data Flow

| Step | Direction | Data Structure | Code Location |
|------|-----------|-----------------|-----------------|
| 1. Client Request | →Server | `{ messages, tripBookSnapshot }` | chat.js:145-152 |
| 2. Server Restore | Internal | `tripBook.updateConstraints/Itinerary()` | server.js:158-168 |
| 3. Tool Execution | Internal | Updates to `tripBook.dynamic`/`itinerary` | server.js:256-402 |
| 4. SSE Event | →Browser | `{ ...toPanelData(), _snapshot }` | server.js:376-379 |
| 5. Browser Storage | Local | `sessionStorage.tp_tripbook_snapshot` | chat.js:303-312 |
| 6. State Update | Internal | `itineraryState.*` fields | itinerary.js:159-215 |
| 7. UI Render | Local | HTML with practical info sections | itinerary.js:483-576 |

---

## Summary

The "实用信息" (Practical Info) system is a multi-layered architecture that:

1. **Captures** practical information from various sources (web searches, API calls, AI updates)
2. **Stores** it in the TripBook model with three distinct layers (dynamic data, user constraints, itinerary)
3. **Caches** destination knowledge separately for reuse across sessions
4. **Injects** this context into the AI system prompt to guide planning decisions
5. **Streams** all practical info to the browser via SSE events
6. **Persists** across sessions using sessionStorage and localStorage
7. **Renders** organized subsections in a unified UI panel with interactive features

The entire flow is driven by the `update_trip_info` tool calls from the AI, which consolidate all practical information at the planning completion stage.
