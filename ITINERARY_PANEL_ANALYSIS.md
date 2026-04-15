# Itinerary Panel (Right Side) - Complete Section Analysis

## Summary
The itinerary panel renders **7 major sections** in order. All rendering is done in **`renderPanel()`** which orchestrates the complete UI assembly.

---

## 1. ALL `renderSection*` FUNCTIONS

### **Section 1: Header (行程概要)**
- **Function**: `renderSectionHeader()` (lines 257-335)
- **Renders**:
  - 📌 Destination title
  - Route bar (stops with arrows)
  - Info grid: dates, people, budget, depart city
  - Preference tags
  - Phase status (current + next hint)
- **Data source**: `itineraryState` basic fields
- **Note**: Route is ONLY rendered here (not repeated elsewhere)

### **Section 2: Daily Itinerary (每日行程)**
- **Function**: `renderSectionItinerary()` (lines 338-345)
- **Renders**:
  - Collapsible day cards
  - Timeline view with segments
  - "Expand All / Collapse All" button
- **Dependencies**: 
  - `renderDaysPlan()` (lines 662-702) → renders day cards
  - `renderTimeline()` (lines 707-753) → renders timeline segments
- **Data source**: `itineraryState.daysPlan[]`

### **Section 3: Transport (交通出行)**
- **Function**: `renderSectionTransport()` (lines 348-380)
- **Renders**:
  - ✈️ Flight quotes (airline, price, duration)
  - 🚌 In-city transport segments (extracted from daysPlan)
- **Helper**: `extractSegmentsByType(['transport', 'flight'])` (lines 617-630)
- **Data source**: 
  - `itineraryState.flights[]` (booking quotes)
  - `itineraryState.daysPlan[].segments[]` (filtered by type)

### **Section 4: Hotels (住宿)**
- **Function**: `renderSectionHotel()` (lines 383-434)
- **Renders**:
  - 📍 Hotel quotes grouped by city (name, nights, price)
  - 🛏️ Hotel segments from daysPlan
- **Helper**: `extractSegmentsByType(['hotel'])` (lines 617-630)
- **Data source**:
  - `itineraryState.hotels[]` (booking quotes)
  - `itineraryState.daysPlan[].segments[]` (filtered by type)

### **Section 5: Food & Attractions (美食 & 景点)**
- **Function**: `renderSectionFoodAndAttraction()` (lines 437-460)
- **Renders**:
  - 🍜 Restaurant/meal segments from daysPlan
  - 📍 Attraction/sightseeing/activity segments from daysPlan
- **Helpers**: 
  - `extractSegmentsByType(['meal', 'food', 'restaurant'])`
  - `extractSegmentsByType(['attraction', 'activity', 'sightseeing'])`
  - `renderExtractedSegments()` (lines 635-657)
- **Data source**: `itineraryState.daysPlan[].segments[]` (filtered by type)

### **Section 6: Budget (预算)**
- **Function**: `renderSectionBudget()` (lines 463-484)
- **Renders**:
  - 💰 Budget summary table if available
  - Otherwise: displays budget target
- **Helper**: `renderBudgetSummary()` (lines 758-801)
- **Data source**: 
  - `itineraryState.budgetSummary` (full breakdown)
  - `itineraryState.budget` (target/goal)

### **Section 7: Practical Info & Pre-Trip Prep (行前准备 & 实用信息)**
- **Function**: `renderSectionPrepAndInfo()` (lines 487-566)
- **Renders** (in order):
  - 🌤️ **Weather**: Temperature + conditions for each city
  - 📋 **Practical Info**: Categories (visa, insurance, etc.) with content
  - 💱 **Exchange Rates**: Currency conversions
  - ⚠️ **Special Requests**: Special needs/requirements
  - 📝 **Reminders/Pre-trip Checklist**: Checkbox list of items
- **Data sources**:
  - `itineraryState.weatherList[]` or `itineraryState.weather` (single)
  - `itineraryState.practicalInfo[]`
  - `itineraryState.exchangeRates[]`
  - `itineraryState.specialRequests[]`
  - `itineraryState.reminders[]`

---

## 2. MAIN RENDER FUNCTION

**Function**: `renderPanel()` (lines 213-254)

**Assembly Order** (in sequence):
```
html += renderSectionHeader()              // Section 1
html += renderSectionItinerary()           // Section 2
html += renderSectionTransport()           // Section 3
html += renderSectionHotel()               // Section 4
html += renderSectionFoodAndAttraction()   // Section 5
html += renderSectionBudget()              // Section 6
html += renderSectionPrepAndInfo()         // Section 7
```

**Key Points**:
- Checks if there's any data before rendering (lines 218-227)
- Shows empty state if no data exists
- Scrolls to top after render (`body.scrollTop = 0`)
- Each section is optional (returns empty string if no data)

---

## 3. PRACTICAL INFO SECTION ("行前准备和实用信息")

**Primary Function**: `renderSectionPrepAndInfo()` (lines 487-566)

**Detailed Sub-Components**:

### 3a. Weather (天气预报) - Lines 500-511
```javascript
if (weatherItems.length > 0) {
  content += '<div class="tab-content-section"><div class="tab-section-label">🌤️ 天气预报</div>';
  for (const w of weatherItems) {
    // Renders: City name + temp_c + description (translated)
  }
}
```
- Renders weather for each city in `weatherList` or single `weather` object
- Translates descriptions (晴, 多云, 下雨, etc.) via `translateWeather()`

### 3b. Practical Info (实用信息) - Lines 514-523
```javascript
if (practicalItems.length > 0) {
  content += '<div class="tab-content-section"><div class="tab-section-label">📋 实用信息</div>';
  for (const item of practicalItems) {
    // Renders: icon + category + content
  }
}
```
- Source: `itineraryState.practicalInfo[]`
- Each item has: `category`, `content`, `icon` (default: 📌)
- Categories typically: visa (签证), insurance (保险), documents (文件), etc.

### 3c. Exchange Rates (汇率) - Lines 526-535
```javascript
if (s.exchangeRates.length > 0) {
  content += '<div class="tab-content-section"><div class="tab-section-label">💱 汇率</div>';
  for (const r of s.exchangeRates) {
    // Renders: "1 FROM = RATE TO (last_updated)"
  }
}
```

### 3d. Special Requests (特殊需求) - Lines 538-547
```javascript
if (s.specialRequests.length > 0) {
  content += '<div class="tab-content-section"><div class="tab-section-label">⚠️ 特殊需求</div>';
  for (const req of s.specialRequests) {
    // Renders: type + value
  }
}
```

### 3e. Reminders/Pre-trip Checklist (行前清单) - Lines 550-560 ⭐ CRITICAL
```javascript
if (s.reminders.length > 0) {
  content += '<div class="tab-content-section"><div class="tab-section-label">📝 行前清单</div>';
  content += '<ul class="reminder-list">';
  for (let i = 0; i < s.reminders.length; i++) {
    // Renders: checkbox + reminder text
    content += `<li class="reminder-item">
      <span class="reminder-check" onclick="toggleReminder(this)"></span>
      <span>${escItinHtml(s.reminders[i])}</span>
    </li>`;
  }
}
```
- **Function**: `toggleReminder()` (lines 571-574) handles check/uncheck
- Data source: `itineraryState.reminders[]` (simple array of strings)

---

## 4. REMINDERS SECTION

**Rendering Location**: Part of `renderSectionPrepAndInfo()` (lines 550-560)

**Features**:
- ✅ Interactive checkbox list
- 📝 Label: "行前清单" (Pre-trip Checklist)
- 🔄 Toggle function: `toggleReminder(element)` adds/removes ✓ checkmark
- Storage: `itineraryState.reminders[]`

**Data Structure** (from trip-book.js):
```javascript
// In TripBook.itinerary.reminders:
reminders: []  // Array of strings: ["出发前3天完成Visit Japan Web注册", ...]
```

---

## 5. DATA STRUCTURES (trip-book.js)

### TripBook.itinerary (Layer 3: Structured Itinerary)
```javascript
itinerary: {
  phase: 0,                // 0-4 (planning stages)
  phaseLabel: '',          // "了解需求", "规划框架", etc.
  route: [],               // ["东京", "京都", "大阪"]
  days: [],                // [{ day, date, city, title, segments[] }]
  budgetSummary: null,     // { flights, hotels, ..., total_cny, budget_cny, remaining_cny }
  reminders: [],           // ["出发前3天完成Visit Japan Web注册", ...]
  practicalInfo: [],       // [{ category: "签证", content: "...", icon: "🛂" }]
}
```

### TripBook.constraints (Layer 2: User Constraints)
```javascript
constraints: {
  destination: { value, cities[], confirmed, confirmed_at },
  departCity: { value, airports[], confirmed, confirmed_at },
  dates: { start, end, days, flexible, confirmed, confirmed_at },
  people: { count, details, confirmed, confirmed_at },
  budget: { value, per_person, currency, confirmed, confirmed_at },
  preferences: { tags[], notes, confirmed, confirmed_at },
  specialRequests: [],  // [{ type, value, confirmed }]
  _history: [],         // Change log
}
```

### TripBook.dynamic (Layer 1: Dynamic Data)
```javascript
dynamic: {
  knowledge: {},         // { "destination_key": {...} }
  weather: {},           // { "tokyo": { city, current, forecast, _meta } }
  exchangeRates: {},     // { "JPY_CNY": { from, to, rate, last_updated, _meta } }
  flightQuotes: [],      // [{ id, route, airline, price_usd, price_cny, ... }]
  hotelQuotes: [],       // [{ id, name, city, checkin, checkout, ... }]
  webSearches: [],       // [{ query, summary, fetched_at }]
}
```

---

## 6. STATE INITIALIZATION (itinerary.js)

**Initial `itineraryState` object** (lines 5-27):
```javascript
let itineraryState = {
  destination: '',
  departCity: '',
  dates: '',
  days: 0,
  people: 0,
  budget: '',
  preferences: [],
  phase: 0,
  phaseLabel: '',
  flights: [],
  hotels: [],
  weather: null,
  weatherList: null,
  route: [],
  daysPlan: [],
  budgetSummary: null,
  reminders: [],                 // ← PRE-TRIP CHECKLIST
  exchangeRates: [],
  webSearchSummaries: [],
  specialRequests: [],
  practicalInfo: [],             // ← PRACTICAL INFO ("行前准备和实用信息")
};
```

---

## 7. KEY FINDINGS - WHAT CAN BE REMOVED

### **REMOVABLE (without breaking UI structure)**:

1. **`practicalInfo` section** (lines 514-523 in renderSectionPrepAndInfo)
   - Data: `itineraryState.practicalInfo[]` and `TripBook.itinerary.practicalInfo[]`
   - Impact: Removes category cards (visa, insurance, etc.)
   - Test: Section 7 will still render without errors

2. **`reminders` section** (lines 550-560 in renderSectionPrepAndInfo)
   - Data: `itineraryState.reminders[]` and `TripBook.itinerary.reminders[]`
   - Impact: Removes pre-trip checklist checkbox list
   - Test: Section 7 will still render without errors

3. **BOTH together** (entire "行前准备和实用信息" section)
   - If ALL sub-components removed (weather, practical, exchange rates, special requests, reminders), entire section renders nothing
   - Need to keep at least one: weather, exchange rates, or special requests (or entire section would be empty)

### **NOT DIRECTLY REMOVABLE (dependencies)**:
- `weatherList`/`weather`: rendered unconditionally in Section 7
- `exchangeRates`: rendered unconditionally in Section 7
- `specialRequests`: rendered unconditionally in Section 7

### **SAFE REMOVAL WITH NO CONSEQUENCES**:
- `practicalInfo` from both `itineraryState` and `TripBook.itinerary`
- `reminders` from both `itineraryState` and `TripBook.itinerary`
- Both functions `renderSectionPrepAndInfo()` methods for these items
- `toggleReminder()` function (if reminders removed)

---

## 8. UPDATE FUNCTIONS

### In itinerary.js:
- `updateItinerary(data)` (lines 88-120) — incremental updates
- `updateFromTripBook(data)` (lines 150-208) — full sync from TripBook
- Both update: `practicalInfo`, `reminders` via `itineraryState` object

### In trip-book.js:
- `updateItinerary(delta)` (lines 198-249) — Layer 3 itinerary updates
  - Handles `practicalInfo[]` merge (lines 239-248)
  - Handles `reminders[]` merge (lines 233-237)
- `toPanelData()` (lines 441-520) — exports data to frontend
  - Exports `practicalInfo` as array of { category, content, icon }
  - Exports `reminders` as simple string array

---

## 9. COMPLETE RENDER FLOW

```
renderPanel()
├─ renderSectionHeader()
│  ├─ destination title
│  ├─ route bar
│  ├─ info grid (date/people/budget/depart)
│  ├─ preference tags
│  └─ phase status
├─ renderSectionItinerary()
│  ├─ renderDaysPlan()
│  │  ├─ toggle all button
│  │  └─ day cards (collapsible)
│  │     └─ renderTimeline()
│  │        └─ timeline segments with dots
├─ renderSectionTransport()
│  ├─ flights (quotes)
│  └─ transport segments (extracted from daysPlan)
├─ renderSectionHotel()
│  ├─ hotel quotes (grouped by city)
│  └─ hotel segments (extracted from daysPlan)
├─ renderSectionFoodAndAttraction()
│  ├─ meal segments (extracted)
│  └─ attraction segments (extracted)
├─ renderSectionBudget()
│  └─ renderBudgetSummary()
│     ├─ budget line items
│     ├─ total
│     └─ remaining/overage
└─ renderSectionPrepAndInfo()
   ├─ weather (🌤️)
   ├─ practical info (📋) ← REMOVABLE
   ├─ exchange rates (💱)
   ├─ special requests (⚠️)
   └─ reminders/checklist (📝) ← REMOVABLE
      └─ toggleReminder() interaction
```

---

## SUMMARY TABLE

| Section | Function | Removable? | Key Data | Rendered If |
|---------|----------|-----------|----------|------------|
| 1. Header | `renderSectionHeader()` | ❌ Core | destination, route, phase | always |
| 2. Daily Itinerary | `renderSectionItinerary()` | ❌ Core | daysPlan[] | daysPlan.length > 0 |
| 3. Transport | `renderSectionTransport()` | ⚠️ Partial | flights[], daysPlan segments | either > 0 |
| 4. Hotels | `renderSectionHotel()` | ⚠️ Partial | hotels[], daysPlan segments | either > 0 |
| 5. Food & Attractions | `renderSectionFoodAndAttraction()` | ⚠️ Partial | daysPlan segments | segments > 0 |
| 6. Budget | `renderSectionBudget()` | ⚠️ Partial | budgetSummary, budget | either set |
| 7a. Weather | in `renderSectionPrepAndInfo()` | ❌ Core | weatherList, weather | items.length > 0 |
| 7b. Practical Info | in `renderSectionPrepAndInfo()` | ✅ **YES** | practicalInfo[] | items.length > 0 |
| 7c. Exchange Rates | in `renderSectionPrepAndInfo()` | ❌ Core | exchangeRates[] | items.length > 0 |
| 7d. Special Requests | in `renderSectionPrepAndInfo()` | ❌ Core | specialRequests[] | items.length > 0 |
| 7e. Reminders | in `renderSectionPrepAndInfo()` | ✅ **YES** | reminders[] | items.length > 0 |

