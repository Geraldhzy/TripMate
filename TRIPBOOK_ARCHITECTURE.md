# AI Travel Planner — TripBook Architecture Summary

## 1. TripBook Model Structure (`models/trip-book.js`)

### Constructor & Core Layers
```javascript
new TripBook(id)
```

**4-Layer Architecture:**

| Layer | Field | Purpose | Data Structure |
|-------|-------|---------|-----------------|
| **1: Static Knowledge** | `knowledgeRefs[]` `activityRefs[]` | Reusable destination/activity knowledge (by key reference) | Array of strings |
| **2: Dynamic Data** | `dynamic: { weather, exchangeRates, flightQuotes, hotelQuotes, webSearches }` | Real-time data with TTL (weather, rates, quotes) | Objects + arrays with metadata |
| **3: User Constraints** | `constraints: { destination, departCity, dates, people, budget, preferences, specialRequests, _history }` | User-confirmed requirements | Objects with `{ value, confirmed, confirmed_at }` structure |
| **4: Itinerary** | `itinerary: { phase, phaseLabel, route, days, budgetSummary, reminders }` | Structured trip plan built incrementally | Object with nested day/segment arrays |

---

### Layer 3: Constraints Structure (Updated via `update_trip_info`)
```javascript
constraints: {
  destination: {
    value: "日本",              // Main destination string
    cities: ["东京", "京都"],   // Sub-cities/regions
    confirmed: true,            // User confirmed
    confirmed_at: 1681234567    // Timestamp
  },
  departCity: {
    value: "北京",
    airports: ["PEK", "PKX"],   // Available departure airports
    confirmed: true,
    confirmed_at: 1681234567
  },
  dates: {
    start: "2026-05-01",        // ISO date string
    end: "2026-05-07",
    days: 7,
    flexible: false,            // Can change dates if needed
    notes: "请假天数不限",      // Additional constraints
    confirmed: true,
    confirmed_at: 1681234567
  },
  people: {
    count: 2,                   // Number of travelers
    details: "2个成人",         // Breakdown (adults/kids/seniors)
    confirmed: true,
    confirmed_at: 1681234567
  },
  budget: {
    value: "2万",               // Amount + currency
    per_person: true,           // true = per person, false = total
    currency: "CNY",            // Currency code
    scope: "含机票住宿",        // What's included
    notes: "可适当超预算",      // Flexibility
    confirmed: true,
    confirmed_at: 1681234567
  },
  preferences: {
    tags: ["美食", "文化"],     // Activity/interest tags
    notes: "以休闲为主，不赶行程",  // Preference notes
    confirmed: true,
    confirmed_at: 1681234567
  },
  specialRequests: [
    { type: "dietary", value: "清真", confirmed: true },
    { type: "accessibility", value: "轮椅通行", confirmed: true }
  ],
  _history: [                   // Change tracking
    { field: "budget", from: "1万", to: "2万", changed_at: 1681234567, reason: "用户修改" }
  ]
}
```

---

### Layer 4: Itinerary Structure (Updated via `update_trip_info`)
```javascript
itinerary: {
  phase: 3,                        // Current planning phase (0-7)
  phaseLabel: "行程规划",         // Human-readable phase name
  route: ["东京", "京都", "大阪"], // Cities in visit order
  
  days: [
    {
      day: 1,                      // Day number (1-indexed)
      date: "2026-05-01",         // ISO date
      city: "东京",               // Current city
      title: "抵达东京",          // Day theme/summary
      segments: [                 // Detailed activities
        {
          time: "14:00",          // Activity time
          title: "到达羽田机场",  // Activity name
          activity: "transportation",  // Alternative field
          location: "羽田机场",   // Location
          duration: "2小时",      // How long
          transport: "电车",      // Transport used
          transportTime: "30分钟", // Travel time
          notes: "使用Suica卡",   // Additional notes
          type: "transportation"  // Segment type
        },
        {
          time: "19:00",
          title: "晚餐",
          location: "新宿",
          notes: "预订时间较晚",
          type: "dining"
        }
      ]
    },
    // More days...
  ],
  
  budgetSummary: {                // Aggregate cost breakdown
    flights: {
      label: "机票",
      amount_cny: 6480,
      count: 2                    // Per-person or total depending on context
    },
    hotels: {
      label: "住宿",
      amount_cny: 7200
    },
    meals: {
      label: "餐饮",
      amount_cny: 2400
    },
    activities: {
      label: "活动",
      amount_cny: 1200
    },
    total_cny: 17280,              // Total spent
    budget_cny: 20000,             // Total budget
    remaining_cny: 2720            // Remaining
  },
  
  reminders: [
    "出发前3天完成Visit Japan Web注册",
    "预订餐厅时注意营业时间",
    "购买JR PASS（如需长途）"
  ]
}
```

---

### Layer 2: Dynamic Data Structure
```javascript
dynamic: {
  weather: {
    "tokyo": {
      city: "东京",
      current: { temp_c: 22, description: "晴天" },
      forecast: [{ date: "2026-05-01", high: 28, low: 18 }],
      _meta: { fetched_at: 1681234567, ttl: 10800000 }  // 3 hours TTL
    }
  },
  
  exchangeRates: {
    "JPY_CNY": {
      from: "JPY",
      to: "CNY",
      rate: 0.045,                // 1 JPY = 0.045 CNY
      last_updated: "2026-04-12T10:30:00Z",
      _meta: { fetched_at: 1681234567, ttl: 14400000 }  // 4 hours TTL
    }
  },
  
  flightQuotes: [
    {
      id: "f1",                   // Auto-generated quote ID
      status: "quoted",           // quoted | selected | booked
      queried_at: 1681234567,
      route: "北京→东京",
      airline: "ANA",
      price_usd: 450,
      price_cny: 3240,
      departure: "2026-05-01 10:00",
      arrival: "2026-05-01 20:00",
      duration: "8小时",
      stops: 0,
      cabin_class: "economy"
    }
  ],
  
  hotelQuotes: [
    {
      id: "h1",
      status: "quoted",           // quoted | selected | booked
      queried_at: 1681234567,
      name: "ホテルニューグランド",
      city: "东京",
      checkin: "2026-05-01",
      checkout: "2026-05-02",
      nights: 1,
      price_per_night_usd: 150,
      price_per_night_cny: 1080,
      price_total_cny: 1080,
      rating: 4.5,
      amenities: ["wifi", "breakfast", "gym"]
    }
  ],
  
  webSearches: [
    {
      query: "日本签证政策",
      summary: "中国护照免签90天",
      fetched_at: 1681234567,
      url: "https://..."
    }
  ]
}
```

---

### Key Methods

#### Writing to TripBook:
```javascript
// Update user constraints incrementally
updateConstraints(delta) {
  // delta: { destination, departCity, dates, people, budget, preferences, specialRequests }
  // Auto-timestamps confirmed_at, tracks history
}

// Update itinerary incrementally
updateItinerary(delta) {
  // delta: { phase, route, days, budgetSummary, reminders }
  // Merges days by day number, preserves existing segments if new ones empty
}

// Dynamic data methods
setWeather(cityKey, data)
setExchangeRate(key, data)
addFlightQuote(quote) → returns quoteId
addHotelQuote(quote) → returns quoteId
addWebSearch(entry)
updateQuoteStatus(quoteId, status)
```

#### Reading from TripBook:
```javascript
// Generate system prompt injection
toSystemPromptSection()
  → "# 行程参考书\n## 已缓存动态数据\n..."

// Build confirmed constraints text
buildConstraintsPromptSection()
  → "## 用户已确认信息\n- 目的地：日本 ✅\n..."

// Build itinerary progress text  
buildItineraryPromptSection()
  → "## 当前行程进度\n阶段 3/7: 行程规划\n..."

// Export for frontend panel
toPanelData()
  → { destination, departCity, dates, days, people, budget, preferences, phase, phaseLabel, route, flights, hotels, weather, budgetSummary, daysPlan }

// Serialize/deserialize
toJSON() → { id, created_at, knowledgeRefs, activityRefs, dynamic, constraints, itinerary }
fromJSON(json) → TripBook instance
```

---

## 2. `update_trip_info` Tool Definition (`tools/update-trip-info.js`)

### Tool Definition (TOOL_DEF)
```javascript
{
  name: 'update_trip_info',
  description: '更新行程参考书。当确认用户需求、完成信息查询、或推进行程规划时调用此工具。',
  parameters: {
    type: 'object',
    properties: {
      constraints: {
        type: 'object',
        description: 'User constraints delta (only changed fields needed)'
      },
      phase: {
        type: 'integer',
        description: 'Current planning phase (1-7): 1锁定约束 2机票查询 3构建框架 4关键预订 5每日详情 6预算汇总 7导出总结'
      },
      itinerary: {
        type: 'object',
        description: 'Itinerary data delta (route, days, budgetSummary, reminders)'
      }
    }
  }
}
```

### Example AI Call
```javascript
// AI calls this after confirming initial constraints:
await update_trip_info({
  constraints: {
    destination: { value: "日本", cities: ["东京","京都"], confirmed: true },
    departCity: { value: "北京", airports: ["PEK","PKX"], confirmed: true },
    dates: { start: "2026-05-01", end: "2026-05-07", days: 7, confirmed: true },
    people: { count: 2, details: "2个成人", confirmed: true },
    budget: { value: "2万", per_person: true, currency: "CNY", confirmed: true }
  },
  phase: 1,
  itinerary: {
    route: ["东京", "京都", "大阪"],
    days: [
      { day: 1, date: "2026-05-01", city: "东京", title: "抵达东京", segments: [] },
      { day: 2, date: "2026-05-02", city: "东京", title: "东京游览", segments: [] },
      { day: 3, date: "2026-05-03", city: "京都", title: "前往京都", segments: [] }
    ]
  }
})

// Returns:
{
  success: true,
  updates: { constraints: {...}, phase: 1, itinerary: {...} },
  message: "已记录目的地、出发城市、日期、人数、预算；确认需求（1/4）；已更新路线、每日行程"
}
```

### Key Points
- **Incremental**: Only pass fields that changed (not entire object)
- **No side effects**: Tool only validates & formats, returns structured response
- **Server integration**: `server.js` reads returned `updates` and calls `tripBook.updateConstraints()` / `tripBook.updateItinerary()`
- **Response format**: Used for client-side notifications + trip panel updates

---

## 3. System Prompt Integration (`prompts/system-prompt.js`)

### How `buildSystemPrompt()` Works

```javascript
function buildSystemPrompt(conversationText, knownRates, knownWeather, tripBook = null)
```

**Builds multi-section prompt by concatenating:**

1. **Current Time** (UTC+8 + weekday)
2. **Holiday Calendar** (Chinese holidays for 2026)
3. **Cached Exchange Rates** (legacy, when tripBook not provided)
4. **Cached Weather** (legacy, when tripBook not provided)
5. **Core Role Definition**
   - "Professional AI travel planner"
   - 7 behavior rules (progressive planning, tool verification, source attribution, etc.)
   - ⚠️ **Strict rule: Never re-ask confirmed info from TripBook**

6. **Progressive Methodology** (imported from `knowledge/methodology.js`)

7. **Tool Use Strategy**
   - Lists all 8 tools with calling conditions
   - **Key instruction for `update_trip_info`:**
     ```
     - **update_trip_info**: 更新行程参考书。**必须在以下时机调用**：
       1. 用户确认了目的地/日期/人数/预算/偏好等约束信息后
       2. 一旦确认目的地和日期，立即写入初步行程骨架（route + days），不要等到行程框架完成
       3. 查询到机票/酒店/天气等信息需要记录时
       4. 推进到新的规划阶段（phase 1-5）时
       5. 逐步补充每日详情时（景点、餐饮、交通等 segments）
       核心原则：右侧行程面板应从对话早期就开始展示内容，随对话推进逐步丰富
     ```

8. **Source Attribution Rules**
   - What must have sources (visa policy, pricing, weather, exchange rates)
   - Format: `[来源: 网站名](URL)`

9. **Destination Knowledge Bases** (dynamic injection)
   - Malaysia (hardcoded, always included if mentioned)
   - Diving (hardcoded, if diving-related terms mentioned)
   - Cached destinations (auto-generated, only if conversation mentions them)

10. **TripBook System Prompt Section** (if tripBook instance provided)
    ```javascript
    if (tripBook) {
      const tripBookSection = tripBook.toSystemPromptSection();
      // Includes:
      // - "# 行程参考书"
      // - "## 已缓存动态数据" (weather, rates, past searches)
      // - "## 用户已确认信息（勿重复询问）" (confirmed constraints)
      // - "## 待确认信息" (pending constraints)
      // - "## 当前行程进度" (phase, route, selected flights/hotels, budget usage)
    }
    ```

---

### TripBook Section Injection Example

When tripBook exists with state:

```
# 行程参考书

## 已缓存动态数据

### 已缓存天气（勿重复调用 get_weather）
- 东京: 22°C，晴天（15分钟前查询，175分钟后过期）

### 已缓存汇率（勿重复调用 get_exchange_rate）
- 1 JPY = 0.045 CNY（10分钟前查询）

### 已完成的搜索（勿重复搜索相同或相似主题）
- "日本签证政策" → 中国护照免签90天（20分钟前）

## 用户已确认信息（勿重复询问）
- 目的地：日本（东京·京都·大阪） ✅
- 出发城市：北京（可用机场：PEK/PKX） ✅
- 日期：2026-05-01 ~ 2026-05-07（7天） ✅
- 人数：2人（2个成人） ✅
- 预算：2万 CNY（人均，含机票住宿） ✅
- 偏好：美食、文化（以休闲为主，不赶行程） ✅

## 当前行程进度
阶段 3/7: 行程规划
路线: 东京 → 京都 → 大阪
已选机票: ANA 北京→东京 ¥3240/人
已选酒店: ホテルニューグランド 东京 ¥1080
预算使用: ¥16200 / ¥20000
```

---

## 4. Key Integration Points

### Call Flow: User Input → AI Response → TripBook Update

1. **User sends message** → Server receives in `server.js`
2. **System prompt built** via `buildSystemPrompt(conversationText, [], [], tripBook)`
3. **AI receives prompt** + conversation history
4. **AI decides to call tools**, including `update_trip_info` with structured delta
5. **Tool result returned** to server (contains `updates` object)
6. **Server applies updates**:
   ```javascript
   if (updates.constraints) tripBook.updateConstraints(updates.constraints);
   if (updates.phase !== undefined) tripBook.updatePhase(updates.phase);
   if (updates.itinerary) tripBook.updateItinerary(updates.itinerary);
   ```
7. **Front-end notified** via SSE/WebSocket with `tripBook.toPanelData()`
8. **Next turn**: New prompt includes TripBook section, AI sees confirmed info

---

## 5. Phase Lifecycle (1-7)

| Phase | Label | When | What AI Should Do |
|-------|-------|------|-------------------|
| 0 | 未开始 | Initial | Waiting for user |
| 1 | 锁定约束 | User provides basics | Confirm all constraints, call `update_trip_info` |
| 2 | 大交通确认 | Constraints locked | Search flights, exchange rates |
| 3 | 行程规划 | Route determined | Build day-by-day skeleton, fill segments |
| 4 | 每日详情 | Days locked | Add activities, timings, restaurants |
| 5 | 行程总结 | Details complete | Build budget summary, add reminders |
| 6 | 预算汇总 | Budget done | Final review, summary |
| 7 | 导出总结 | (Not in code yet) | Export/finalize |

---

## Summary Table

| Component | Location | Purpose | Key Output |
|-----------|----------|---------|------------|
| **TripBook** | `models/trip-book.js` | 4-layer data model (static refs, dynamic data, user constraints, itinerary) | `toSystemPromptSection()`, `toPanelData()`, `toJSON()` |
| **update_trip_info** | `tools/update-trip-info.js` | AI interface to write constraints + itinerary | Structured response for server to apply updates |
| **System Prompt** | `prompts/system-prompt.js` | Dynamic prompt assembly | Full instruction for AI including TripBook state |
| **Tool Index** | `tools/index.js` | Tool registry | Anthropic + OpenAI format definitions |

