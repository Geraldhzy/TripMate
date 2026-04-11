# Backend Data Structure Analysis — Complete Documentation

**Generated:** 2026-04-12  
**Location:** `/Users/geraldhuang/DEV/ai-travel-planner`

---

## 📋 Quick Navigation

This exploration provides a **complete understanding of what data is available from the backend for the itinerary panel**.

### Generated Documents

1. **[`backend_data_structure.md`](./backend_data_structure.md)** (30KB, 1175 lines)
   - **Comprehensive deep-dive** into every data structure
   - Complete method signatures with line numbers
   - All tool input/output formats
   - Data flow diagrams and processing logic
   - **Best for:** Understanding every field and how data flows

2. **[`data_flow_summary.txt`](./data_flow_summary.txt)** (17KB)
   - **Quick reference guide** with visual ASCII diagrams
   - 4-layer TripBook architecture overview
   - 8-tool ecosystem summary
   - Data flow from user → AI → TripBook → frontend
   - Cache strategy and phase transitions
   - **Best for:** Quick lookup and high-level understanding

---

## 🎯 Key Findings

### TripBook — Single Source of Truth
Located in `models/trip-book.js` (525 lines)

The TripBook manages **4 layers of data**:

```
Layer 1: StaticKnowledge    → Reusable destination/activity knowledge
Layer 2: DynamicData         → Weather, rates, flight/hotel quotes (TTL cache)
Layer 3: UserConstraints    → Confirmed user requirements (destination, dates, budget, etc.)
Layer 4: Itinerary          → AI-built trip plan (route, daily segments, budget summary)
```

### Data Export Methods

**For Frontend Rendering:**
```javascript
tripBook.toPanelData()
// Returns: flattened, UI-friendly structure
// Includes: destination, flights, hotels, weather, daysPlan, budgetSummary, phase
```

**For Persistence:**
```javascript
tripBook.toJSON()
// Returns: complete internal state
// Used by: client-side localStorage for session recovery
```

### The 8 Tools

| Tool | Input | Output | Cache | Syncs To |
|------|-------|--------|-------|----------|
| `search_flights` | origin, destination, date | flights[] | None | addFlightQuote() |
| `search_hotels` | city, checkin, checkout | hotels[] | None | addHotelQuote() |
| `get_weather` | city, date? | current, forecast | 3h per city | setWeather() |
| `get_exchange_rate` | from, to, amount? | rate, converted | 4h per pair | setExchangeRate() |
| `web_search` | query, language | results[] | Deduplicated | addWebSearch() |
| `search_poi` | query, location, category | pois[] | None | None (results-only) |
| `cache_destination_knowledge` | destination, content | success | 30 days per dest | addKnowledgeRef() |
| **`update_trip_info`** | constraints, phase, itinerary | updates | Immediate | **Core writer** |

### Data Available for Itinerary Panel

When `update_trip_info` is called (the AI's primary data writer), the frontend receives:

```javascript
{
  // From toPanelData():
  destination: "Japan (Tokyo·Kyoto·Osaka)",
  departCity: "Beijing",
  dates: "2026-05-01 ~ 2026-05-07",
  days: 7,
  people: 3,
  budget: "¥20,000",
  preferences: ["美食", "文化", "休闲"],
  
  phase: 3,                              // 0-7 planning stage
  phaseLabel: "行程规划",
  route: ["Tokyo", "Kyoto", "Osaka"],
  
  flights: [
    { route: "MFM → NRT", airline: "ANA", price: "¥3,240", 
      time: "9h 30m", status: "selected" }
  ],
  
  hotels: [
    { name: "Hotel Metropolitan", city: "Tokyo", price: "¥3,960", 
      nights: 2, status: "selected" }
  ],
  
  weather: { city: "Tokyo", temp_c: 18, description: "Partly cloudy" },
  weatherList: [ /* multi-city weather */ ],
  
  budgetSummary: {
    flights: { amount_cny: 6480, label: "Flights" },
    hotels: { amount_cny: 7920, label: "Hotels" },
    activities: { amount_cny: 2000, label: "Activities" },
    food: { amount_cny: 1500, label: "Food" },
    transport: { amount_cny: 500, label: "Transport" },
    total_cny: 17964,
    budget_cny: 20000,
    remaining_cny: 2036
  },
  
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
  ],
  
  // Plus _snapshot for persistence:
  _snapshot: {
    id: "trip_...",
    constraints: { /* full history */ },
    dynamic: { /* all quotes, searches */ },
    itinerary: { /* complete plan */ },
    knowledgeRefs: [ /* cached destinations */ ]
  }
}
```

---

## 📍 File Reference

### Core Files Explored

**server.js** (647 lines)
- **Line 22-131:** POST /api/chat route (main entry point)
- **Line 51:** TripBook instantiation
- **Line 179-284:** runTool() — Tool execution & TripBook synchronization
- **Line 195-212:** Weather/Exchange rate sync to TripBook
- **Line 215-239:** Flight/Hotel quote synchronization
- **Line 257-274:** update_trip_info processing (core data writer)
- **Line 416-489:** Quick replies extraction logic

**models/trip-book.js** (525 lines)
- **Line 23-62:** Constructor (4 layers defined)
- **Line 84-130:** Layer 2 methods (setWeather, setExchangeRate, addFlightQuote, etc.)
- **Line 140-179:** Layer 3: updateConstraints() method
- **Line 199-239:** Layer 4: updateItinerary() method
- **Line 248-306:** buildConstraintsPromptSection() (system prompt injection)
- **Line 311-341:** buildItineraryPromptSection()
- **Line 346-393:** buildDynamicDataPromptSection()
- **Line 398-420:** toSystemPromptSection() (complete TripBook context)
- **Line 430-494:** `toPanelData()` ✅ **Frontend export method**
- **Line 500-510:** `toJSON()` ✅ **Persistence export method**

**Tools/** (8 files)
- `flight-search.js` → Calls search_flights.py (Google Flights)
- `hotel-search.js` → Calls search_hotels.py (Google Hotels)
- `weather.js` → wttr.in API (3-hour cache)
- `exchange-rate.js` → open.er-api.com (4-hour cache)
- `web-search.js` → Bing HTML parsing
- `poi-search.js` → OpenStreetMap (Nominatim + Overpass)
- `dest-knowledge.js` → File-based cache (30 days)
- `update-trip-info.js` → **Core TripBook writer**

**tools/scripts/**
- `search_flights.py` (174 lines) — fast-flights integration
- `search_hotels.py` (99 lines) — Playwright integration

---

## 🔄 Data Flow Summary

```
User Message
    ↓
AI Agent (Claude/GPT-4o/DeepSeek)
    ↓ (max 10 tool rounds)
Tool Calls
    ├─ search_flights      → Flight quotes → addFlightQuote()
    ├─ search_hotels       → Hotel quotes → addHotelQuote()
    ├─ get_weather         → Weather data → setWeather()
    ├─ get_exchange_rate   → Rates → setExchangeRate()
    ├─ web_search          → Search results → addWebSearch()
    ├─ cache_destination_knowledge → Knowledge → addKnowledgeRef()
    └─ update_trip_info    → ✅ CORE UPDATE → updateConstraints/Phase/Itinerary()
    ↓
SSE Events to Frontend
    ├─ token (real-time text)
    ├─ tool_start / tool_result
    ├─ rate_cached / weather_cached
    ├─ tripbook_update ← ✅ **MAIN UI DATA** (toPanelData + _snapshot)
    ├─ quick_replies
    └─ done
```

---

## 🎬 How to Use These Documents

### For Frontend Integration
1. Read **data_flow_summary.txt** for 5-minute understanding
2. Reference **backend_data_structure.md** sections:
   - `toPanelData()` structure (what fields you'll receive)
   - SSE event types and timing
   - Quote status lifecycle

### For Debugging Data Issues
1. Check **backend_data_structure.md** section 2 (Tools)
2. Verify tool input/output formats
3. Trace data flow in server.js (runTool function)
4. Check TripBook methods that sync data

### For Understanding Constraints Flow
1. Read **data_flow_summary.txt** "CONSTRAINTS FLOW" section
2. Review trip-book.js:
   - updateConstraints() method (lines 140-179)
   - buildConstraintsPromptSection() (lines 248-306)
3. Understand how confirmed flag prevents re-asking

### For Building Panel Features
Reference what data is available:
- **Constraints:** destination, departCity, dates, people, budget, preferences
- **Dynamic data:** weather[], flights[], hotels[], rates{}
- **Itinerary:** route[], daysPlan[], budgetSummary, phase, reminders[]
- **Metadata:** confirmed flags, timestamps, status (quoted/selected/booked)

---

## 🔑 Key Insights

### Quote Status Lifecycle
```
"quoted"   ← Initial state when tool adds quote
  ↓
"selected" ← AI or user picks this option
  ↓
"booked"   ← Confirmed/reserved
```

### Caching Strategy
- **Server-side:** Weather (3h), Rates (4h), Destinations (30d)
- **Client-side:** knownRates, knownWeather (with TTL), tripBookSnapshot
- **TripBook:** Flights/Hotels (no TTL), Web searches (deduplicated by query)

### Phase Progression
```
0: Not started
1: 锁定约束 (Confirm constraints)
2: 大交通确认 (Confirm major transport)
3: 行程规划 (Build itinerary)
4: 每日详情 (Daily details)
5: 行程总结 (Summary)
```

Maps to 4-stage frontend display:
- Phases 0-1 → Stage 1: "确认需求"
- Phases 2-3 → Stage 2: "规划行程"
- Phases 4-5 → Stage 3: "完善细节"
- Phase 6+ → Stage 4: "预算总结"

### Data Persistence
- Frontend sends back `tripBookSnapshot` on each request
- Server restores state via `updateConstraints()` + `updateItinerary()`
- Complete state audit trail in `constraints._history[]`

---

## ✅ Verification Checklist

Use this to verify your understanding:

- [ ] I understand the 4-layer architecture of TripBook
- [ ] I know what `toPanelData()` returns for the panel
- [ ] I can trace how flight quotes flow from tool to TripBook to frontend
- [ ] I understand the difference between "quoted" and "selected" status
- [ ] I know which tools sync to TripBook and which don't
- [ ] I understand the SSE event sequence and timing
- [ ] I can explain how constraints are marked "confirmed"
- [ ] I know the TTL for each cached data type
- [ ] I understand how the phase system works
- [ ] I can explain why `update_trip_info` is the core writer

---

## 📚 Related Documentation

Already in the repository:
- `TRIPBOOK_DATA_STRUCTURES.md` — Earlier TripBook format docs
- `TRIPBOOK_PERSISTENCE_IMPLEMENTATION.md` — Session recovery details
- `RENDERING_FLOWCHART.md` — UI rendering flow

---

**Status:** ✅ Complete  
**Thoroughness:** All 4 TripBook layers documented  
**Coverage:** All 8 tools with input/output specs  
**Line Numbers:** Included for key methods  
**Code Examples:** Comprehensive  

Use these documents as a complete reference for the itinerary panel backend data structure.

