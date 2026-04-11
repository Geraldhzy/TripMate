# AI Travel Planner — Backend Data Structure Overview

**Last Updated:** 2026-04-12  
**Location:** `/Users/geraldhuang/DEV/ai-travel-planner`

---

## 1. TripBook Class — Single Source of Truth

### Location
`/models/trip-book.js` (Lines 1-525)

### Architecture
The TripBook manages 4 layers of data for each trip planning session:

```
Layer 1: StaticKnowledge  — Country/destination backgrounds (cross-trip reuse)
Layer 2: DynamicData       — Weather/rates/flight/hotel quotes (TTL-based cache)
Layer 3: UserConstraints   — Confirmed user requirements
Layer 4: Itinerary         — AI-built trip plan structure
```

### Constructor (Lines 23-62)
```javascript
class TripBook {
  constructor(id) {
    this.id = id || `trip_${Date.now()}`;
    this.created_at = Date.now();

    // Layer 1: Knowledge references (not copied, just keys)
    this.knowledgeRefs = [];   // ["Japan", "Thailand"]
    this.activityRefs = [];    // ["Scuba Diving"]

    // Layer 2: Dynamic data
    this.dynamic = {
      weather: {},          // { "tokyo": { city, current, forecast, _meta } }
      exchangeRates: {},    // { "JPY_CNY": { from, to, rate, last_updated, _meta } }
      flightQuotes: [],     // [{ id, route, date, airline, price_usd, ... }]
      hotelQuotes: [],      // [{ id, name, city, checkin, checkout, ... }]
      webSearches: [],      // [{ query, summary, fetched_at }]
    };

    // Layer 3: User constraints
    this.constraints = {
      destination:   null,  // { value, cities[], confirmed, confirmed_at }
      departCity:    null,  // { value, airports[], confirmed, confirmed_at }
      dates:         null,  // { start, end, days, flexible, confirmed, confirmed_at }
      people:        null,  // { count, details, confirmed, confirmed_at }
      budget:        null,  // { value, per_person, currency, confirmed, confirmed_at }
      preferences:   null,  // { tags[], notes, confirmed, confirmed_at }
      specialRequests: [],  // [{ type, value, confirmed }]
      _history: [],         // [{ field, from, to, changed_at, reason }]
    };

    // Layer 4: Structured itinerary
    this.itinerary = {
      phase: 0,
      phaseLabel: '',
      route: [],            // ["Tokyo", "Kyoto", "Osaka"]
      days: [],             // [{ day, date, city, title, segments[] }]
      budgetSummary: null,  // { flights, hotels, ..., total_cny, budget_cny }
      reminders: [],        // ["Complete Visit Japan Web 3 days before..."]
    };
  }
}
```

### Key Methods

#### Layer 2: Dynamic Data Storage (Lines 84-130)

**setWeather(cityKey, data)**  
Stores weather query results from `weather.js`
```javascript
{
  city: "Tokyo",
  current: {
    temp_c: 18,
    feels_like_c: 16,
    humidity: "65%",
    description: "Partly cloudy",
    wind_kmh: 12
  },
  forecast: [
    {
      date: "2026-05-02",
      max_temp_c: 22,
      min_temp_c: 15,
      avg_humidity: 60,
      description: "Sunny",
      rain_chance: "10",
      sunrise: "05:30",
      sunset: "18:45"
    }
  ],
  fetched_at: 1712950000000,
  _meta: { fetched_at, ttl: 3*3600000 }  // 3-hour TTL
}
```

**setExchangeRate(key, data)**  
Stores exchange rate queries. Key format: `"USD_CNY"`
```javascript
{
  from: "USD",
  to: "CNY",
  rate: 7.25,
  last_updated: "2026-04-12T10:30:00Z",
  fetched_at: 1712950000000,
  _meta: { fetched_at, ttl: 4*3600000 }  // 4-hour TTL
}
```

**addFlightQuote(quote)** (Lines 94-100)  
Returns quote ID (e.g., "f1", "f2", ...)
```javascript
// Input structure:
{
  route: "MFM → NRT",          // origin → destination
  date: "2026-05-01",
  airline: "ANA",
  price_usd: 450,
  duration: "9h 30m",
  stops: 0
}

// Stored as:
{
  id: "f1",
  status: "quoted",            // "quoted" | "selected" | "booked"
  queried_at: 1712950000000,
  route: "MFM → NRT",
  date: "2026-05-01",
  airline: "ANA",
  price_usd: 450,
  duration: "9h 30m",
  stops: 0
}
```

**addHotelQuote(quote)** (Lines 102-108)  
Returns quote ID (e.g., "h1", "h2", ...)
```javascript
// Input structure:
{
  name: "Hotel Metropolitan Tokyo",
  city: "Tokyo",
  checkin: "2026-05-01",
  checkout: "2026-05-03",
  nights: 2,
  price_per_night_usd: 180,
  price_total_cny: 2610,      // Optional, pre-converted
  rating: 4.5
}

// Stored as:
{
  id: "h1",
  status: "quoted",            // "quoted" | "selected" | "booked"
  queried_at: 1712950000000,
  name: "Hotel Metropolitan Tokyo",
  city: "Tokyo",
  checkin: "2026-05-01",
  checkout: "2026-05-03",
  nights: 2,
  price_per_night_usd: 180,
  price_total_cny: 2610,
  rating: 4.5
}
```

**addWebSearch(entry)** (Lines 110-123)  
Deduplicates by query, prevents LLM from re-searching same topic
```javascript
{
  query: "日本签证中国护照",
  summary: "找到 5 条结果，首条: 中国公民赴日本签证申请...",
  fetched_at: 1712950000000
}
```

#### Layer 3: User Constraints (Lines 140-179)

**updateConstraints(delta)**  
Incremental update called by AI via `update_trip_info` tool
```javascript
// Example delta (partial update):
{
  destination: {
    value: "Japan",
    cities: ["Tokyo", "Kyoto", "Osaka"],
    confirmed: true,
    confirmed_at: 1712950000000
  },
  dates: {
    start: "2026-05-01",
    end: "2026-05-07",
    days: 7,
    flexible: false,
    confirmed: true,
    confirmed_at: 1712950000000
  },
  budget: {
    value: "¥20,000",
    per_person: true,
    currency: "CNY",
    scope: "含机票住宿",
    notes: "可适当超预算",
    confirmed: true,
    confirmed_at: 1712950000000
  }
}
```

**Full constraint field structure:**
```javascript
destination: {
  value: "Japan",                    // Display string
  cities: ["Tokyo", "Kyoto", "Osaka"],
  confirmed: boolean,
  confirmed_at: timestamp
}

departCity: {
  value: "Beijing",
  airports: ["PEK", "PKX"],         // Available airports
  confirmed: boolean,
  confirmed_at: timestamp
}

dates: {
  start: "2026-05-01",              // YYYY-MM-DD
  end: "2026-05-07",
  days: 7,
  flexible: boolean,                 // Date flexibility flag
  notes: "Request 2 days leave",
  confirmed: boolean,
  confirmed_at: timestamp
}

people: {
  count: 3,
  details: "2 adults, 1 child",
  confirmed: boolean,
  confirmed_at: timestamp
}

budget: {
  value: "¥20,000",                 // Free text (AI interprets)
  per_person: boolean,               // true = 人均, false = 总预算
  currency: "CNY",
  scope: "含机票住宿",               // What's included
  notes: "可灵活超预算",
  confirmed: boolean,
  confirmed_at: timestamp
}

preferences: {
  tags: ["美食", "文化", "休闲"],   // Multi-select tags
  notes: "不接受红眼航班",
  confirmed: boolean,
  confirmed_at: timestamp
}

specialRequests: [
  { type: "dietary", value: "清真", confirmed: true },
  { type: "accessibility", value: "轮椅通道", confirmed: true }
]

_history: [
  {
    field: "destination",
    from: "Thailand",
    to: "Japan",
    changed_at: timestamp,
    reason: "User changed mind"
  }
]
```

#### Layer 4: Itinerary (Lines 185-239)

**updatePhase(phase)** (Lines 188-193)  
Sets current planning phase (0-7). Maps to phase labels:
```
0: (Not started)
1: 锁定约束 (Lock constraints)
2: 大交通确认 (Confirm major transport)
3: 行程规划 (Plan itinerary)
4: 每日详情 (Daily details)
5: 行程总结 (Itinerary summary)
6: 预算汇总 (Budget summary)
7: (Reserved)
```

**updateItinerary(delta)** (Lines 199-239)  
Incremental itinerary update
```javascript
// Example delta:
{
  phase: 3,
  route: ["Tokyo", "Kyoto", "Osaka"],
  days: [
    {
      day: 1,                        // Sequential day number
      date: "2026-05-01",
      city: "Tokyo",
      title: "Arrival in Tokyo",
      segments: [
        {
          time: "14:00",
          title: "Land at Narita",
          location: "Narita Airport",
          duration: "4h",
          transport: "Train",
          transportTime: "60 min",
          notes: "Take Narita Express to Shinjuku",
          type: "transport"
        },
        {
          time: "19:00",
          title: "Check-in",
          location: "Hotel Metropolitan Tokyo",
          duration: "1h",
          notes: "Near Shinjuku Station",
          type: "activity"
        }
      ]
    },
    // ... Day 2, 3, etc.
  ],
  budgetSummary: {
    flights: { amount_cny: 6480, label: "Flights (2 pax)" },
    hotels: { amount_cny: 7920, label: "Hotels (4 nights)" },
    activities: { amount_cny: 2000, label: "Activities & POIs" },
    food: { amount_cny: 1500, label: "Food & dining" },
    transport: { amount_cny: 500, label: "Local transport" },
    total_cny: 17964,
    budget_cny: 20000,              // User's budget
    remaining_cny: 2036
  },
  reminders: [
    "Complete Visit Japan Web registration 3 days before departure",
    "Book Fushimi Inari tours in advance",
    "Get pocket WiFi at Narita Airport"
  ]
}
```

### Export Methods (Lines 430-510)

#### **toPanelData()** (Lines 430-494)
**Used By:** Frontend itinerary panel for rendering  
**Returns:** Flattened, frontend-friendly structure

```javascript
{
  // From Layer 3: Constraints
  destination: "Japan（Tokyo·Kyoto·Osaka）",
  departCity: "Beijing",
  dates: "2026-05-01 ~ 2026-05-07",
  days: 7,
  people: 3,
  budget: "¥20,000",
  preferences: ["美食", "文化", "休闲"],

  // From Layer 4: Itinerary
  phase: 3,
  phaseLabel: "行程规划",
  route: ["Tokyo", "Kyoto", "Osaka"],
  
  // Flight quotes (filtered: show non-quoted unless ≤5 total)
  flights: [
    {
      route: "MFM → NRT",
      airline: "ANA",
      price: "¥3,240",                 // Formatted
      time: "9h 30m",
      status: "selected"               // "quoted" | "selected" | "booked"
    }
  ],
  
  // Hotel quotes (same filtering logic)
  hotels: [
    {
      name: "Hotel Metropolitan Tokyo",
      city: "Tokyo",
      price: "¥3,960",                 // Total or per-night formatted
      nights: 2,
      status: "selected"
    }
  ],
  
  // Weather (single-city backward compat)
  weather: {
    city: "Tokyo",
    temp_c: 18,
    description: "Partly cloudy"
  },
  
  // Weather (multi-city list)
  weatherList: [
    { city: "Tokyo", temp_c: 18, description: "Partly cloudy" },
    { city: "Kyoto", temp_c: 16, description: "Sunny" }
  ],
  
  budgetSummary: { flights, hotels, ..., total_cny, budget_cny, remaining_cny },
  
  // Daily plan (formatted for UI)
  daysPlan: [
    {
      day: 1,
      date: "2026-05-01",
      city: "Tokyo",
      title: "Arrival",
      segments: [
        {
          time: "14:00",
          title: "Land at Narita",
          location: "Narita Airport",
          duration: "4h",
          transport: "Train",
          transportTime: "60 min",
          notes: "Take Narita Express to Shinjuku",
          type: "transport"
        }
      ]
    }
  ]
}
```

#### **toJSON()** (Lines 500-510)
**Used By:** Persistence, client snapshots for recovery  
**Returns:** Complete internal state

```javascript
{
  id: "trip_1712950000000",
  created_at: 1712950000000,
  knowledgeRefs: ["日本"],
  activityRefs: ["潜水"],
  dynamic: {
    weather: { "tokyo": { ... }, "kyoto": { ... } },
    exchangeRates: { "USD_CNY": { ... } },
    flightQuotes: [ {...}, {...} ],
    hotelQuotes: [ {...}, {...} ],
    webSearches: [ {...} ]
  },
  constraints: {
    destination: { ... },
    departCity: { ... },
    dates: { ... },
    people: { ... },
    budget: { ... },
    preferences: { ... },
    specialRequests: [ ... ],
    _history: [ ... ]
  },
  itinerary: {
    phase: 3,
    phaseLabel: "行程规划",
    route: [ ... ],
    days: [ ... ],
    budgetSummary: { ... },
    reminders: [ ... ]
  }
}
```

---

## 2. Tools Input/Output Data Structures

### Location
`/tools/` directory

### 2.1 Flight Search Tool

**File:** `flight-search.js` (Lines 1-63)  
**Python Backend:** `tools/scripts/search_flights.py` (Lines 1-174)

**Input (JSON via stdin)**
```javascript
{
  origin: "MFM",              // IATA code (Macau)
  destination: "NRT",         // IATA code (Tokyo Narita)
  date: "2026-05-01",         // YYYY-MM-DD
  passengers: 2               // Default: 1
}
```

**Output (JSON stdout)**
```javascript
{
  origin: "MFM",
  destination: "NRT",
  date: "2026-05-01",
  currency: "USD",
  flights: [
    {
      airline: "ANA",                    // Airline name
      departure: "10:30",                // Departure time (HH:MM)
      arrival: "19:45",                  // Arrival time (HH:MM)
      duration: "9h 15m",                // Flight duration
      stops: 0,                          // 0 = nonstop, 1+ = number of stops
      price_usd: 450.00,                 // Price in USD (float) or null if unavailable
      price: "$450",                     // Raw price string
      is_best: true                      // Highlight best deals
    },
    // ... more flights, sorted by price ascending
  ],
  total_results: 8
  
  // Error case:
  error: "机票搜索脚本执行失败",
  detail: "..."
}
```

**Processing in server.js (Lines 215-226)**
When `search_flights` result arrives, each flight is added to TripBook:
```javascript
// In runTool():
if (funcName === 'search_flights' && Array.isArray(parsed.flights)) {
  const route = `${parsed.origin || funcArgs.origin || '?'} → ${parsed.destination || '?'}`;
  const flightDate = parsed.date || funcArgs.date || '';
  for (const f of parsed.flights) {
    tripBook.addFlightQuote({
      route, date: flightDate, airline: f.airline,
      price_usd: f.price_usd,
      duration: f.duration, stops: f.stops,
    });
  }
}
```

### 2.2 Hotel Search Tool

**File:** `hotel-search.js` (Lines 1-62)  
**Python Backend:** `tools/scripts/search_hotels.py` (Lines 1-99)

**Input (JSON via stdin)**
```javascript
{
  city: "Kuala Lumpur",       // City name (English)
  checkin: "2026-05-01",      // YYYY-MM-DD
  checkout: "2026-05-03"      // YYYY-MM-DD
}
```

**Output (JSON stdout)**
```javascript
{
  city: "Kuala Lumpur",
  checkin: "2026-05-01",
  checkout: "2026-05-03",
  currency: "USD",
  hotels: [
    {
      name: "Petronas Twin Towers Hotel",
      price_per_night: "$180",          // String with currency
      rating: "4.5"                     // String or null
    },
    // ... more hotels
  ],
  total_results: 8
  
  // Error case:
  error: "搜索失败",
  note: "无法从Google Hotels获取数据，建议使用web_search..."
}
```

**Processing in server.js (Lines 228-239)**
```javascript
if (funcName === 'search_hotels' && Array.isArray(parsed.hotels)) {
  for (const h of parsed.hotels) {
    tripBook.addHotelQuote({
      name: h.name, city: h.city,
      checkin: h.checkin, checkout: h.checkout, nights: h.nights,
      price_per_night_usd: h.price_per_night_usd || h.price_per_night,
      price_total_cny: h.price_total_cny,
      rating: h.rating,
    });
  }
}
```

### 2.3 Weather Tool

**File:** `weather.js` (Lines 1-110)

**Input Parameters**
```javascript
{
  city: "Tokyo",              // City name (English)
  date: "2026-05-02"          // Optional, specific date YYYY-MM-DD
}
```

**Output (JSON)**
```javascript
{
  city: "Tokyo",
  current: {
    temp_c: 18,               // Current temperature in Celsius
    feels_like_c: 16,
    humidity: "65%",
    description: "Partly cloudy",
    wind_kmh: 12
  },
  forecast: [                 // Array of next 3 days
    {
      date: "2026-05-01",
      max_temp_c: 22,
      min_temp_c: 15,
      avg_humidity: 60,
      description: "Sunny",
      rain_chance: "10",      // Percentage string
      sunrise: "05:30",       // HH:MM format
      sunset: "18:45"
    },
    // ... more days
  ],
  fetched_at: 1712950000000,  // Timestamp in milliseconds
  from_cache: false,          // true if served from server cache
  
  // Error case:
  error: "城市不存在"
}
```

**Data Source:** wttr.in (free, no key required)  
**Cache:** 3 hours (server-side, in-memory)  
**Processing in server.js (Lines 205-212)**
```javascript
if (funcName === 'get_weather' && !parsed.error) {
  sendSSE('weather_cached', parsed);    // Notify frontend
  tripBook.setWeather(parsed.city || '', {
    city: parsed.city, current: parsed.current, forecast: parsed.forecast,
    _meta: { fetched_at: parsed.fetched_at || Date.now(), ttl: 3 * 3600000 }
  });
}
```

### 2.4 Exchange Rate Tool

**File:** `exchange-rate.js` (Lines 1-102)

**Input Parameters**
```javascript
{
  from: "USD",                // Source currency code
  to: "CNY",                  // Target currency code (default: "CNY")
  amount: 450.00              // Optional, amount to convert
}
```

**Output (JSON)**
```javascript
{
  from: "USD",
  to: "CNY",
  rate: 7.25,                 // Exchange rate (1 USD = 7.25 CNY)
  last_updated: "2026-04-12T10:30:00Z",
  fetched_at: 1712950000000,  // Timestamp in milliseconds
  from_cache: false,          // true if served from server cache
  
  // If amount provided:
  amount: 450.00,
  converted: 3262.50,         // 450 * 7.25
  display: "450 USD = 3262.50 CNY",
  
  // Error case:
  error: "不支持的货币代码: XYZ"
}
```

**Data Source:** open.er-api.com (free, no key required)  
**Cache:** 4 hours (server-side, in-memory)  
**Processing in server.js (Lines 195-202)**
```javascript
if (funcName === 'get_exchange_rate' && parsed.rate && !parsed.error) {
  sendSSE('rate_cached', parsed);      // Notify frontend
  tripBook.setExchangeRate(`${parsed.from}_${parsed.to}`, {
    from: parsed.from, to: parsed.to, rate: parsed.rate,
    last_updated: parsed.last_updated,
    _meta: { fetched_at: parsed.fetched_at || Date.now(), ttl: 4 * 3600000 }
  });
}
```

### 2.5 Web Search Tool

**File:** `web-search.js` (Lines 1-237)

**Input Parameters**
```javascript
{
  query: "日本签证中国护照",  // Search keywords (supports Chinese)
  language: "zh-CN"           // Optional, "zh-CN" or "en"
}
```

**Output (JSON)**
```javascript
{
  query: "日本签证中国护照",
  results: [
    {
      title: "中国公民赴日本签证申请指南",
      url: "https://example.com/visa-guide",
      snippet: "中国护照持有人可申请日本旅游签证，有效期3个月..."
    },
    {
      title: "日本签证费用和流程",
      url: "https://example.com/cost",
      snippet: "2026年日本旅游签证单次入境费用为250元人民币..."
    },
    // ... up to 15 results
  ],
  
  // Error cases:
  error: "搜索关键词不能为空",
  note: "请输入有效的搜索关键词"
}
```

**Data Source:** Bing search (no key required, HTML parsing)  
**Processing in server.js (Lines 246-255)**
```javascript
if (funcName === 'web_search' && !parsed.error) {
  const query = funcArgs.query || parsed.query || '';
  const firstResult = Array.isArray(parsed.results) && parsed.results[0];
  const summary = firstResult
    ? `找到 ${parsed.results.length} 条结果，首条: ${(firstResult.title || '').slice(0, 60)}`
    : '已搜索';
  tripBook.addWebSearch({ query, summary });
}
```

### 2.6 POI Search Tool

**File:** `poi-search.js` (Lines 1-126)

**Input Parameters**
```javascript
{
  query: "Semporna dive shop",         // Search keywords
  location: "Semporna",                // City/area name (English)
  category: "dive_shop"                // Category: restaurant, attraction, hotel, atm, dive_shop, cafe, shopping
}
```

**Output (JSON)**
```javascript
{
  query: "Semporna dive shop",
  location: "Semporna",
  center: { lat: 4.23, lon: 118.6 },   // Location coordinates
  results: [
    {
      name: "Sipadan Dive Center",
      lat: 4.235,
      lon: 118.605,
      category: "dive_shop",
      address: "No. 1, Jalan Utama, Semporna",
      phone: "+60-89-781234",
      website: "https://sipadan-dive.com",
      opening_hours: "Mo-Su 08:00-18:00"
    },
    // ... up to 10 results
  ],
  
  // Error case:
  error: "无法定位: Semporna"
}
```

**Data Source:** OpenStreetMap (Nominatim + Overpass API, free, no key required)

### 2.7 Destination Knowledge Tool

**File:** `dest-knowledge.js` (Lines 1-165)

**Input Parameters**
```javascript
{
  destination: "Japan",       // Destination name (Chinese, e.g., "日本")
  content: "# 日本旅行指南\n## 签证政策\n..."  // Markdown formatted knowledge
}
```

**Output (JSON)**
```javascript
{
  success: true,
  destination: "Japan",
  message: "已缓存\"Japan\"目的地知识库，后续对话将直接复用"
  
  // Error case:
  error: "缺少必要参数: destination, content"
}
```

**Storage:** 
- File: `prompts/knowledge/dest-{destination}.js`
- Format: JavaScript module exporting `{ destination, saved_at, content }`
- TTL: 30 days

### 2.8 Update Trip Info Tool (Core Data Writer)

**File:** `update-trip-info.js` (Lines 1-127)

**Purpose:** AI's primary interface to write structured data to TripBook

**Input Parameters**
```javascript
{
  constraints: {
    // Each field below is optional (incremental update)
    destination: {
      value: "日本",
      cities: ["东京", "京都", "大阪"],
      confirmed: true
    },
    departCity: {
      value: "北京",
      airports: ["PEK", "PKX"],
      confirmed: true
    },
    dates: {
      start: "2026-05-01",
      end: "2026-05-07",
      days: 7,
      flexible: false,
      notes: "请假天数不限",
      confirmed: true
    },
    people: {
      count: 2,
      details: "2个成人",
      confirmed: true
    },
    budget: {
      value: "2万",
      per_person: true,
      currency: "CNY",
      scope: "含机票住宿",
      notes: "可适当超预算",
      confirmed: true
    },
    preferences: {
      tags: ["美食", "文化"],
      notes: "以休闲为主，不接受红眼航班",
      confirmed: true
    },
    specialRequests: [
      { type: "dietary", value: "清真", confirmed: true }
    ]
  },
  
  phase: 3,                   // Planning phase (1-7)
  
  itinerary: {
    route: ["东京", "京都", "大阪"],
    days: [
      {
        day: 1,
        date: "2026-05-01",
        city: "东京",
        title: "抵达东京",
        segments: [
          {
            time: "14:00",
            title: "降落成田",
            location: "成田机场",
            duration: "4h",
            transport: "Train",
            transportTime: "60 min",
            notes: "成田特快到新宿",
            type: "transport"
          }
        ]
      }
    ],
    budgetSummary: {
      flights: { amount_cny: 6480, label: "机票" },
      hotels: { amount_cny: 7920, label: "酒店" },
      activities: { amount_cny: 2000, label: "活动" },
      food: { amount_cny: 1500, label: "美食" },
      transport: { amount_cny: 500, label: "交通" },
      total_cny: 17964,
      budget_cny: 20000,
      remaining_cny: 2036
    },
    reminders: [
      "出发前3天完成Visit Japan Web注册"
    ]
  }
}
```

**Output (JSON)**
```javascript
{
  success: true,
  updates: {
    constraints: { ... },     // What was updated
    phase: 3,
    itinerary: { ... }
  },
  message: "已记录目的地、出发城市、日期、人数、预算、偏好；行程框架已生成（3/4）"
  
  // Error case:
  error: "phase 必须在 1-7 之间"
}
```

**Processing in server.js (Lines 257-274)**
```javascript
if (funcName === 'update_trip_info' && parsed.success && parsed.updates) {
  const updates = parsed.updates;
  if (updates.constraints) tripBook.updateConstraints(updates.constraints);
  if (updates.phase !== undefined) tripBook.updatePhase(updates.phase);
  if (updates.itinerary) tripBook.updateItinerary(updates.itinerary);
  
  // Send to frontend with complete snapshot for persistence
  sendSSE('tripbook_update', {
    ...tripBook.toPanelData(),
    _snapshot: tripBook.toJSON()
  });
}
```

---

## 3. Tool Registration

**File:** `tools/index.js` (Lines 1-55)

All 8 tools are registered:
1. `web_search`
2. `get_weather`
3. `get_exchange_rate`
4. `search_poi`
5. `search_flights`
6. `search_hotels`
7. `cache_destination_knowledge`
8. `update_trip_info`

Tools are exported in two formats:
- **OpenAI format:** `getToolDefinitions()`
- **Anthropic format:** `getToolDefinitionsForAnthropic()`

---

## 4. Tool Result Flow in server.js

**Location:** `server.js`, Lines 179-284

### Execution Pipeline

```
User Message
    ↓
AI Agent (Claude/GPT-4o)
    ↓
Tool Call (async, max 10 rounds)
    ↓
runTool() — Line 179
    ├─ sendSSE('tool_start')
    ├─ executeToolCall()
    ├─ Parse result JSON
    ├─ Sync to TripBook:
    │   ├─ Exchange rates → tripBook.setExchangeRate()
    │   ├─ Weather → tripBook.setWeather()
    │   ├─ Flight quotes → tripBook.addFlightQuote()
    │   ├─ Hotel quotes → tripBook.addHotelQuote()
    │   ├─ Web searches → tripBook.addWebSearch()
    │   ├─ Destination knowledge → tripBook.addKnowledgeRef()
    │   └─ update_trip_info → tripBook.updateConstraints/Phase/Itinerary()
    ├─ sendSSE('rate_cached' / 'weather_cached') [if applicable]
    ├─ sendSSE('tripbook_update', toPanelData() + toJSON()) [if update_trip_info]
    └─ sendSSE('tool_result')
    ↓
Next Tool or AI Response
    ↓
Extract Quick Replies from response text (Lines 416-489)
    ↓
sendSSE('quick_replies') [if applicable]
    ↓
sendSSE('done')
```

### SSE Events Sent to Frontend

| Event | Data | Source |
|-------|------|--------|
| `token` | `{ text: "..." }` | Real-time AI response |
| `tool_start` | `{ id, name, arguments }` | Tool execution starts |
| `tool_result` | `{ id, name, resultLabel }` | Tool completes |
| `rate_cached` | Exchange rate object | After get_exchange_rate |
| `weather_cached` | Weather object | After get_weather |
| `tripbook_update` | `{ toPanelData(), _snapshot: toJSON() }` | After update_trip_info |
| `quick_replies` | `{ questions: [{ text, options, ... }] }` | AI response analysis |
| `done` | `{}` | Conversation round complete |
| `error` | `{ message }` | Error occurred |

---

## 5. System Prompt Injection

**Location:** `server.js`, Line 106

```javascript
const systemPrompt = buildSystemPrompt(conversationText, knownRates, knownWeather, tripBook);
```

### buildSystemPrompt() Creates

```
1. TripBook static knowledge references
2. Dynamic data caches (weather, rates) to prevent repeated API calls
3. User constraints (confirmed & pending)
4. Current itinerary progress
5. Quick reply pattern information
```

**From TripBook methods (trip-book.js):**
- `toSystemPromptSection()` — Complete TripBook context (Lines 398-420)
- `buildConstraintsPromptSection()` — Confirmed/pending constraints (Lines 248-306)
- `buildItineraryPromptSection()` — Current progress (Lines 311-341)
- `buildDynamicDataPromptSection()` — Weather/rates/searches cache (Lines 346-393)

---

## 6. Client-Server Data Sync

**Request (POST /api/chat)** — Line 22
```javascript
{
  messages: [{ role, content }, ...],
  provider: "anthropic" | "openai" | "deepseek",
  model: "...",
  apiKey: "...",
  
  // Caches from previous session
  knownRates: [{ from, to, rate, fetched_at, ttl }, ...],
  knownWeather: [{ city, current, forecast, fetched_at, ttl }, ...],
  
  // Snapshot of previous TripBook state for recovery
  tripBookSnapshot: {
    constraints: { ... },
    itinerary: { ... },
    knowledgeRefs: [ ... ]
  }
}
```

**Response (Server-Sent Events - SSE)**
```
Multiple events streamed in real-time:
event: token
data: { "text": "..." }

event: tool_start
data: { "id": "...", "name": "...", "arguments": {...} }

event: tool_result
data: { "id": "...", "name": "...", "resultLabel": "..." }

event: tripbook_update
data: { "destination": "...", "phase": 3, "_snapshot": {...} }

event: weather_cached
data: { "city": "...", "current": {...}, "forecast": [...] }

event: rate_cached
data: { "from": "USD", "to": "CNY", "rate": 7.25, ... }

event: quick_replies
data: { "questions": [{ "text": "...", "options": [...] }] }

event: done
data: {}
```

---

## 7. Data Validation & Error Handling

### TripBook Updates
- **Partial updates allowed** — Only changed fields in `updateConstraints()`, `updateItinerary()`
- **Merge strategy** — Shallow merge preserves existing sub-fields
- **Status tracking** — Each quote has status: `"quoted"` → `"selected"` → `"booked"`
- **History logging** — Constraint changes tracked with timestamp and reason

### Tool Results
- All tools return JSON (success or error structure)
- Invalid JSON gracefully handled in `runTool()` (Line 193)
- Failed tools don't crash — errors captured in SSE events
- Flight/hotel with `price_usd: null` handled separately (price unavailable)

---

## 8. TripBook Lifecycle

```
Session Start
    ↓
POST /api/chat with tripBookSnapshot (or null)
    ↓
new TripBook() created
    ↓
snapshot.constraints/itinerary restored (if provided)
    ↓
knownRates/knownWeather injected as exchange rates
    ↓
AI agent processes user request
    ↓
Tools called → toPanelData() + toJSON() sent to frontend
    ↓
Frontend receives _snapshot: toJSON()
    ↓
Client persists snapshot locally
    ↓
Next turn sends tripBookSnapshot back → restore + continue
```

---

## 9. Key Insights for Frontend Integration

### What Frontend Receives for Itinerary Panel

**Primary Data Source:** `toPanelData()` (trip-book.js:430-494)

**Rendering Fields:**
- `destination` — Display string with cities
- `departCity` — Departure city
- `dates` — Formatted date range
- `days` — Total days
- `people` — Pax count
- `budget` — Budget amount
- `preferences` — Array of tags
- `phase` — Current planning stage (0-7)
- `phaseLabel` — Stage name
- `route` — City list
- `flights` — Filtered flight quotes with status
- `hotels` — Filtered hotel quotes with status
- `weather` / `weatherList` — Current/forecast
- `budgetSummary` — Breakdown + remaining budget
- `daysPlan` — Detailed daily itinerary with segments

### Complete State Recovery

**Use:** `_snapshot: toJSON()` from `tripbook_update` SSE event

Contains full internal state for persistence across sessions, including:
- `constraints._history` — Change audit trail
- `dynamic.flightQuotes` — All quotes (not filtered)
- `dynamic.hotelQuotes` — All quotes (not filtered)
- `dynamic.webSearches` — Search history for de-duplication
- `itinerary.reminders` — All action items

---

## Document Version History

| Date | Changes |
|------|---------|
| 2026-04-12 | Initial comprehensive documentation of all 4 TripBook layers, 8 tools, SSE data flow, and frontend integration points |

