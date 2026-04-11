# TripBook Class & Data Structures - Complete Analysis

## Overview
TripBook is the **single source of truth** for a travel planning session. It's a JavaScript class (not Python) located at `/Users/geraldhuang/DEV/ai-travel-planner/models/trip-book.js`. It manages data across 4 layers and provides multiple export methods.

---

## 1. What does `toSystemPromptSection()` return?

**Method**: `toSystemPromptSection()` (lines 394-416)

**Return Type**: String (Markdown formatted)

**What it returns**: A complete system prompt section containing:
1. Header: `# 行程参考书` (Trip Reference Book)
2. **已缓存动态数据** (Cached Dynamic Data) section - includes:
   - Weather data (if cached)
   - Exchange rates (if cached)
   - Previous web search results (to avoid duplicate searches)
3. **用户已确认信息** (User Confirmed Information) section
4. **待确认信息** (Pending Information) section
5. **当前行程进度** (Current Itinerary Progress) section
6. Selected flights and hotels with prices

**Example output structure** (Markdown):
```
# 行程参考书

## 已缓存动态数据
### 已缓存天气（勿重复调用 get_weather）
- tokyo: 15°C，Partly cloudy（5分钟前查询，175分钟后过期）

### 已缓存汇率（勿重复调用 get_exchange_rate）
- 1 JPY = 0.048 CNY（5分钟前查询）

### 已完成的搜索（勿重复搜索相同或相似主题）
- "japan visa" → 找到 10 条结果，首条: Japan Visa Requirements...（3分钟前）

## 用户已确认信息（勿重复询问）
- 目的地：日本（东京·京都·大阪） ✅
- 出发城市：北京（可用机场：PEK/PKX） ✅
- 日期：2026-05-01 ~ 2026-05-07（7天） ✅
- 人数：2人（2个成人） ✅
- 预算：2万CNY（人均，含机票住宿） ✅

## 当前行程进度
阶段 3/7: 构建框架
路线: 东京 → 京都 → 大阪
已选机票: ANA Tokyo-Beijing ¥3240/人
已选酒店: Hilton Tokyo ¥1200/晚
预算使用: ¥17964 / ¥20000
```

**Key characteristics**:
- Returns empty header + "(尚未开始规划)" if no data present
- Marked with ⚠️ symbols to prevent AI from re-querying
- Includes TTL (time-to-live) and age information for cached data

---

## 2. What does `toPanelData()` return - Frontend Payload Structure

**Method**: `toPanelData()` (lines 426-486)

**Return Type**: JavaScript Object (JSON-serializable)

**SSE Event**: Sent as `event: tripbook_update` via HTTP Server-Sent Events

**Exact Structure**:
```javascript
{
  // User Constraints (Flattened)
  destination: "日本 东京·京都·大阪",           // string
  departCity: "北京",                        // string
  dates: "2026-05-01 ~ 2026-05-07",        // string (formatted)
  days: 7,                                  // number
  people: 2,                                // number
  budget: "2万",                            // string (original value)
  preferences: ["美食", "文化", "摄影"],      // array of strings

  // Itinerary Progress
  phase: 3,                                 // number (0-7)
  phaseLabel: "构建框架",                     // string
  route: ["东京", "京都", "大阪"],            // array of strings

  // Flight Quotes (filtered, max 5 if all 'quoted' status)
  flights: [
    {
      route: "北京 → 东京",                  // string
      airline: "ANA",                       // string
      price: "¥3240",                       // string (formatted CNY if available, else USD)
      time: "11h 30m",                      // string (duration)
      status: "selected"                    // "quoted" | "selected" | "booked"
    }
  ],

  // Hotel Quotes (filtered, max 5 if all 'quoted' status)
  hotels: [
    {
      name: "Hilton Tokyo",                 // string
      city: "东京",                         // string
      price: "¥1200",                       // string (formatted; can be "¥X" or "$Y/晚")
      nights: 3,                            // number
      status: "selected"                    // "quoted" | "selected" | "booked"
    }
  ],

  // Current Weather (first cached weather entry)
  weather: {
    city: "Tokyo",                          // string (English from wttr.in)
    temp_c: 15,                             // number
    description: "Partly cloudy"            // string (English from wttr.in)
  } | null,                                 // can be null if no weather cached

  // Budget Summary
  budgetSummary: {
    flights: { amount_cny: 6480, label: "机票" },
    hotels: { amount_cny: 3600, label: "住宿" },
    activities: { amount_cny: 2000, label: "活动" },
    food: { amount_cny: 2000, label: "餐饮" },
    transport: { amount_cny: 500, label: "本地交通" },
    misc: { amount_cny: 1000, label: "其他" },
    total_cny: 15680,                       // number
    budget_cny: 20000,                      // number
    remaining_cny: 4320                     // number
  } | null,                                 // can be null

  // Daily Plan (Core Structure)
  daysPlan: [
    {
      day: 1,                               // number (1-indexed)
      date: "2026-05-01",                   // string (YYYY-MM-DD)
      city: "东京",                         // string
      title: "抵达东京",                     // string (day theme)
      segments: [
        {
          time: "14:30",                    // string (HH:MM or empty)
          title: "飞机降落",                 // string (activity name or title)
          location: "成田机场",              // string (venue/location)
          duration: "30分钟",                // string (e.g., "1小时", "2.5小时")
          transport: "机场大巴",             // string (mode of transport)
          transportTime: "1小时",            // string (e.g., "30分钟")
          notes: "到达酒店后自由活动",        // string (additional notes)
          type: "activity"                  // "activity" | "meal" | "transport" | etc
        },
        {
          time: "20:00",
          title: "入住酒店",
          location: "Hilton Tokyo",
          duration: "",
          transport: "",
          transportTime: "",
          notes: "晚间自由活动",
          type: "activity"
        },
        {
          time: "21:00",
          title: "晚餐",
          location: "涩谷美食街",
          duration: "1小时",
          transport: "",
          transportTime: "",
          notes: "推荐拉面店",
          type: "meal"
        }
      ]
    },
    // ... more days
  ]
}
```

**Important Notes**:
- Sent to frontend via SSE event `tripbook_update`
- Used to update the right-side itinerary panel in real-time
- `weather.description` is in **English** (from wttr.in API)
- All other strings are in **Chinese**
- The structure is **flat** (no nested objects except daysPlan.segments)
- Date strings are in format `YYYY-MM-DD` or `YYYY-MM-DD ~ YYYY-MM-DD`

---

## 3. How is `daysPlan` structured? (Part of toPanelData())

**Source**: Lines 472-484 in trip-book.js

**Generated from**: `this.itinerary.days` array

**Each Day Object Structure**:
```javascript
{
  day: 1,                    // number: day number (1-indexed, auto-sorted)
  date: "2026-05-01",        // string: YYYY-MM-DD format
  city: "东京",              // string: city name (Chinese)
  title: "抵达东京",         // string: day's theme/title
  segments: [                // array of activity segments
    {
      time: "14:30",         // string: HH:MM format (can be empty)
      title: "飞机降落",      // string: displayed activity name
      location: "成田机场",   // string: venue/address
      duration: "30分钟",     // string: how long (e.g., "1小时30分钟")
      transport: "机场大巴",  // string: transport mode (e.g., "JR电车", "出租车")
      transportTime: "1小时", // string: travel duration (e.g., "20分钟")
      notes: "到达酒店前...", // string: additional info/tips
      type: "activity"       // string: segment type
    }
  ]
}
```

**Segment Types** (observed):
- `"activity"` - sightseeing, visiting POI
- `"meal"` - dining experience
- `"transport"` - movement between locations
- `"accommodation"` - hotel check-in/out
- (others possible, typically "activity" as default)

**How segments are populated in toPanelData()** (lines 474-483):
```javascript
segments: (d.segments || []).map(seg => ({
  time: seg.time || '',
  title: seg.title || seg.activity || '',           // Fallback: use 'activity' field if 'title' missing
  location: seg.location || '',
  duration: seg.duration || '',
  transport: seg.transport || '',
  transportTime: seg.transportTime || '',
  notes: seg.notes || '',
  type: seg.type || 'activity',                     // Default to 'activity'
}))
```

**Days array storage** (lines 212-224 in updateItinerary):
- Days are merged by `day` number (overwrite if exists)
- Auto-sorted by `day` number ascending
- **Update happens incremental**: new days merged with existing, not replaced

---

## 4. How is `weather` data stored? Language and Source

**Storage Location**: `this.dynamic.weather` (Map-like Object)

**Key Format**: City name in lowercase (e.g., `"tokyo"`)

**Data Structure Stored**:
```javascript
{
  city: "Tokyo",                    // string: English city name (from API)
  current: {
    temp_c: 15,                     // number: Celsius
    feels_like_c: 14,               // number
    humidity: "65%",                // string (includes %)
    description: "Partly cloudy",   // string: ENGLISH from wttr.in
    wind_kmh: 12                    // number
  },
  forecast: [
    {
      date: "2026-05-02",           // string: YYYY-MM-DD
      max_temp_c: 18,               // number
      min_temp_c: 12,               // number
      avg_humidity: 60,             // number (percentage, no %)
      description: "Rainy",         // string: ENGLISH
      rain_chance: "80",            // string or number
      sunrise: "05:30",             // string: HH:MM
      sunset: "18:45"               // string: HH:MM
    }
  ],
  fetched_at: 1712947200000,        // timestamp (milliseconds)
  _meta: {
    fetched_at: 1712947200000,      // timestamp (when fetched)
    ttl: 10800000                   // number: 3 hours in milliseconds
  }
}
```

**Language**: 
- **All weather descriptions in ENGLISH** (from wttr.in API)
- Examples: "Sunny", "Rainy", "Partly cloudy", "Thunderstorms"
- This is NOT translated to Chinese

**Data Source**: `wttr.in` API (free, no API key needed)
- URL: `https://wttr.in/{city}?format=j1`
- Returns: Current condition + 3-day forecast
- Data fetched in `tools/weather.js` lines 40-97

**How it's populated**:
1. AI calls `get_weather` tool
2. Tool fetches from wttr.in, parses response
3. server.js calls `tripBook.setWeather(city, data)` (line 208)
4. Stored in `this.dynamic.weather[city.toLowerCase()]`

---

## 5. Weather Tool (get_weather) - Data Format Return

**Tool Definition**: `tools/weather.js`

**Tool Name**: `get_weather`

**Parameters**:
```javascript
{
  city: {
    type: 'string',
    description: '城市名（英文），如 Kuala Lumpur, Kota Kinabalu, Semporna'
  },
  date: {
    type: 'string',
    description: '可选，查询特定日期 YYYY-MM-DD。不传则返回未来3天'
  }
}
```

**Return Format** (JSON string):
```json
{
  "city": "Tokyo",
  "current": {
    "temp_c": 15,
    "feels_like_c": 14,
    "humidity": "65%",
    "description": "Partly cloudy",
    "wind_kmh": 12
  },
  "forecast": [
    {
      "date": "2026-05-02",
      "max_temp_c": 18,
      "min_temp_c": 12,
      "avg_humidity": 60,
      "description": "Rainy",
      "rain_chance": "80",
      "sunrise": "05:30",
      "sunset": "18:45"
    },
    {
      "date": "2026-05-03",
      "max_temp_c": 20,
      "min_temp_c": 13,
      "avg_humidity": 55,
      "description": "Sunny",
      "rain_chance": "0",
      "sunrise": "05:29",
      "sunset": "18:46"
    },
    {
      "date": "2026-05-04",
      "max_temp_c": 19,
      "min_temp_c": 14,
      "avg_humidity": 58,
      "description": "Cloudy",
      "rain_chance": "10",
      "sunrise": "05:28",
      "sunset": "18:47"
    }
  ],
  "fetched_at": 1712947200000,
  "from_cache": false  // or true if returned from server cache
}
```

**Or on error**:
```json
{
  "city": "Tokyo",
  "error": "Connection timeout"
}
```

**Caching**:
- Server-side cache: 3 hours (TTL)
- Cache key: city name (lowercase)
- Lines 44-52: Return cached data if available

**Data Field Mappings** (from wttr.in raw response):
- `temp_C` → `temp_c`
- `FeelsLikeC` → `feels_like_c`
- `humidity` → `humidity` (appended with '%')
- `weatherDesc[0].value` → `description`
- `windspeedKmph` → `wind_kmh`
- `date` → `date` (passed through)
- `maxtempC` / `mintempC` → `max_temp_c` / `min_temp_c`
- `hourly[4].chanceofrain` → `rain_chance`
- `astronomy[0].sunrise` / `sunset` → `sunrise` / `sunset`

---

## 6. SSE Communication - How Frontend Receives Updates

**HTTP Server-Sent Events Flow**:

1. **POST /api/chat** endpoint (server.js line 20)
2. Sets SSE headers (line 38-41)
3. During execution, sends multiple SSE events:

**Event Types Sent**:
```
event: tool_start
data: { id, name, arguments }

event: tool_result
data: { id, name, resultLabel }

event: weather_cached
data: { city, current, forecast, fetched_at, from_cache }

event: rate_cached
data: { from, to, rate, last_updated, fetched_at }

event: tripbook_update          ← MAIN UPDATE EVENT
data: { destination, departCity, dates, days, people, budget, preferences, phase, phaseLabel, route, flights, hotels, weather, budgetSummary, daysPlan }

event: token
data: { text }                   ← AI streaming text

event: quick_replies
data: { questions: [...] }

event: done
data: {}

event: error
data: { message }
```

**tripbook_update Event** (lines 270):
- Triggered when `update_trip_info` tool is called successfully
- Payload: Result of `tripBook.toPanelData()`
- **No translations applied** - weather descriptions stay in English

---

## 7. TripBook Data Layers Summary

**Layer 1: Static Knowledge**
```javascript
{
  knowledgeRefs: ["日本", "泰国"],     // destination keys
  activityRefs: ["潜水", "美食"]       // activity keys
}
```

**Layer 2: Dynamic Data**
```javascript
{
  weather: {
    "tokyo": { city, current, forecast, _meta },
    "kyoto": { ... }
  },
  exchangeRates: {
    "JPY_CNY": { from, to, rate, last_updated, _meta },
    "USD_CNY": { ... }
  },
  flightQuotes: [
    { id: "f1", route, date, airline, price_usd, duration, stops, status, queried_at }
  ],
  hotelQuotes: [
    { id: "h1", name, city, checkin, checkout, nights, price_per_night_usd, price_total_cny, rating, status, queried_at }
  ],
  webSearches: [
    { query, summary, fetched_at }
  ]
}
```

**Layer 3: User Constraints**
```javascript
{
  destination: { value, cities[], confirmed, confirmed_at },
  departCity: { value, airports[], confirmed, confirmed_at },
  dates: { start, end, days, flexible, notes, confirmed, confirmed_at },
  people: { count, details, confirmed, confirmed_at },
  budget: { value, per_person, currency, scope, notes, confirmed, confirmed_at },
  preferences: { tags[], notes, confirmed, confirmed_at },
  specialRequests: [{ type, value, confirmed }],
  _history: [{ field, from, to, changed_at, reason }]
}
```

**Layer 4: Itinerary**
```javascript
{
  phase: 3,                          // 1-7
  phaseLabel: "构建框架",
  route: ["东京", "京都", "大阪"],
  days: [
    {
      day: 1,
      date: "2026-05-01",
      city: "东京",
      title: "抵达东京",
      segments: [
        { time, title, location, duration, transport, transportTime, notes, type }
      ]
    }
  ],
  budgetSummary: { flights, hotels, activities, ..., total_cny, budget_cny, remaining_cny },
  reminders: ["出发前3天完成Visit Japan Web注册"]
}
```

---

## 8. Key Methods Reference

| Method | Input | Output | Purpose |
|--------|-------|--------|---------|
| `toSystemPromptSection()` | - | String (Markdown) | Injects trip info into AI system prompt |
| `toPanelData()` | - | Object (JSON) | Exports frontend payload via SSE |
| `updateConstraints(delta)` | Object | void | Incremental constraint update |
| `updateItinerary(delta)` | Object | void | Incremental itinerary update |
| `updatePhase(phase)` | Number (1-7) | void | Set planning phase |
| `setWeather(city, data)` | String, Object | void | Store weather data |
| `addFlightQuote(quote)` | Object | String (id) | Add flight option |
| `addHotelQuote(quote)` | Object | String (id) | Add hotel option |
| `addWebSearch(entry)` | Object | void | Track search (dedup by query) |
| `toJSON()` | - | Object | Serialize for storage |

---

## 9. Important Notes for Frontend Integration

1. **Weather descriptions are in English** - may need translation
2. **Date format**: Use `YYYY-MM-DD` consistently
3. **Prices**: Always check for `price_cny` (preferred) or fallback to `price_usd`
4. **Status values**: `"quoted"` (search result), `"selected"` (user choice), `"booked"` (confirmed)
5. **Segment type defaults to `"activity"`** if not specified
6. **daysPlan is incremental** - each new day merged into existing array
7. **Missing fields default to empty strings** in toPanelData export
8. **Budget can be per_person OR total** - check `budget.per_person` boolean
9. **Dates can be start/end OR just days** - check which fields are populated
