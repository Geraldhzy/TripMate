# TripBook — Quick Reference Card

## Essential Field Structures

### Constraints (Layer 3) — What `update_trip_info` accepts

```javascript
{
  destination: {
    value: "日本",                    // What user said
    cities: ["东京", "京都"],         // Parsed sub-cities
    confirmed: true,                  // User signed off
    confirmed_at: timestamp,          // Auto-filled by updateConstraints()
    _reason: "User said..."           // (Optional, gets deleted after merge)
  },
  
  departCity: {
    value: "北京",
    airports: ["PEK", "PKX"],        // Multiple options
    confirmed: true,
    confirmed_at: timestamp
  },
  
  dates: {
    start: "2026-05-01",              // ISO format
    end: "2026-05-07",
    days: 7,                          // Calculated
    flexible: false,                  // Can user change dates?
    notes: "Leave days not limited",  // Extra context
    confirmed: true,
    confirmed_at: timestamp
  },
  
  people: {
    count: 2,                         // Total travelers
    details: "2 adults",              // Breakdown text
    confirmed: true,
    confirmed_at: timestamp
  },
  
  budget: {
    value: "20,000",                  // Can be string "2万" or number
    per_person: true,                 // TRUE = per person | FALSE = total trip
    currency: "CNY",                  // Defaults to CNY
    scope: "Flights + hotels",        // What's included
    notes: "Can go over slightly",    // Flexibility notes
    confirmed: true,
    confirmed_at: timestamp
  },
  
  preferences: {
    tags: ["Food", "Culture"],        // Interest/activity tags
    notes: "Relaxed pace, no rush",   // Additional preferences
    confirmed: true,
    confirmed_at: timestamp
  },
  
  specialRequests: [
    { type: "dietary", value: "Halal", confirmed: true },
    { type: "accessibility", value: "Wheelchair accessible", confirmed: false }
    // type: "dietary" | "accessibility" | "visa" | custom
  ]
}
```

### Itinerary (Layer 4) — What `update_trip_info` accepts

```javascript
{
  phase: 1,                          // 0=not started, 1-7=phases, maps to 1-4 in UI
  // phaseLabel auto-calculated from PHASE_LABELS array
  
  route: ["Tokyo", "Kyoto", "Osaka"],  // Cities in visit order
  
  days: [
    {
      day: 1,                        // Must be unique within trip
      date: "2026-05-01",            // ISO date
      city: "Tokyo",                 // Which city today?
      title: "Arrival",              // Day summary/theme
      segments: [                    // Can be empty array on first call
        {
          time: "14:00",             // Activity start time (24h format)
          title: "Land at Haneda",   // Activity name
          activity: "transportation",// Alt field name (if used instead of "title")
          location: "Haneda",        // Where?
          duration: "2 hours",       // How long?
          transport: "Train",        // How getting there?
          transportTime: "30 min",   // Travel duration
          type: "transportation",    // Segment type: transportation|dining|activity|etc
          notes: "Buy Suica card"    // Additional notes
        },
        {
          time: "19:00",
          title: "Dinner",
          location: "Shinjuku",
          type: "dining",
          notes: "Reserve in advance"
        }
      ]
    },
    // Day 2, 3, etc. follow same structure
  ],
  
  budgetSummary: {
    flights: {
      label: "Flights",
      amount_cny: 6480,              // Cost in CNY
      count: 2                       // Per person or total
    },
    hotels: {
      label: "Hotels",
      amount_cny: 7200,
      nights: 7                      // Number of nights
    },
    meals: {
      label: "Meals",
      amount_cny: 2400
    },
    activities: {
      label: "Activities",
      amount_cny: 1200
    },
    transportation: {
      label: "Local transport",
      amount_cny: 500
    },
    shopping: {                       // Optional custom categories
      label: "Shopping",
      amount_cny: 1000
    },
    total_cny: 18780,                // Sum of all categories
    budget_cny: 20000,               // Total budget from constraints
    remaining_cny: 1220              // budget_cny - total_cny
  },
  
  reminders: [
    "Register for Visit Japan Web 3 days before",
    "Book restaurants in advance",
    "Buy JR Pass if needed"
  ]
}
```

---

## When to Call `update_trip_info`

| Trigger | What to Pass | Example |
|---------|--------------|---------|
| **User confirms destination** | `constraints: { destination }` | User: "I want to go to Japan" |
| **User confirms all initial needs** | `constraints: { destination, departCity, dates, people, budget, preferences }` + `phase: 1` + skeleton `itinerary` | After gathering all 5 constraints |
| **Update one constraint** | `constraints: { budget: {...} }` | User: "Actually, I have ¥30k" |
| **Search finds flights** | (Call other tools, update via server separately) | Flight search returns 3 options |
| **Confirm which flight to book** | `dynamic.flightQuotes` updated server-side (not via tool) | User picks one flight |
| **Create day-by-day skeleton** | `itinerary: { route, days[] }` with empty segments | After route finalized |
| **Fill in activities for a day** | `itinerary: { days: [{ day: N, segments: [...] }] }` | AI adds restaurant/temple/museum |
| **Calculate final budget** | `itinerary: { budgetSummary: {...}, reminders: [...] }` | At end of planning |
| **Move to next phase** | `phase: N` | When moving from phase 2 to phase 3 |

---

## System Prompt Injection — What AI Sees

**TripBook section is only injected if `tripBook` instance exists:**

```markdown
# 行程参考书

## 已缓存动态数据

### 已缓存天气（勿重复调用 get_weather）
- Tokyo: 22°C, Sunny (15 minutes ago, expires in 175 minutes)

### 已缓存汇率（勿重复调用 get_exchange_rate）
- 1 JPY = 0.045 CNY (10 minutes ago)

### 已完成的搜索（勿重复搜索相同或相似主题）
- "Japan visa policy" → Chinese passport visa-free 90 days (20 minutes ago)

## 用户已确认信息（勿重复询问）  ← DO NOT RE-ASK THESE!
- Destination: Japan (Tokyo·Kyoto·Osaka) ✅
- Departure city: Beijing (Airports: PEK/PKX) ✅
- Dates: 2026-05-01 ~ 2026-05-07 (7 days) ✅
- People: 2 (Adults) ✅
- Budget: ¥20,000 (Per person, Flights+Hotels) ✅
- Preferences: Food, Culture (Relaxed, no rush) ✅

## 待确认信息
- Special requests: None yet ❓

## 当前行程进度
Phase 2/7: Flight Booking
Route: Tokyo → Kyoto → Osaka
Selected Flights: ANA Beijing→Tokyo ¥3,240/person
Selected Hotels: Hotel New Grand Tokyo ¥1,080
Budget Usage: ¥16,200 / ¥20,000
```

**AI MUST:**
- ✅ Use confirmed info as facts, don't re-ask
- ✅ Avoid searching for info already in cache (weather, exchange rates)
- ✅ Continue planning based on current phase
- ❌ NOT ask "So you want to go to Japan?" when destination is ✅

---

## TripBook Methods — What to Call

### Writing Data (AI calls `update_trip_info` tool)
```javascript
// Tool response → Server calls these:
tripBook.updateConstraints(delta)
tripBook.updatePhase(num)
tripBook.updateItinerary(delta)

// Server calls for other tools:
tripBook.setWeather(cityKey, data)
tripBook.setExchangeRate(key, data)
tripBook.addFlightQuote(quoteData) // Returns quoteId: "f1", "f2", etc.
tripBook.addHotelQuote(quoteData)  // Returns quoteId: "h1", "h2", etc.
tripBook.updateQuoteStatus(quoteId, 'selected' | 'booked')
```

### Reading Data

**For System Prompt (injected into AI's prompt):**
```javascript
const section = tripBook.toSystemPromptSection();
// Returns markdown string ready to inject into system prompt
```

**For Frontend Panel (send to client):**
```javascript
const panelData = tripBook.toPanelData();
// Returns: {
//   destination, departCity, dates, days, people, budget, preferences,
//   phase, phaseLabel, route,
//   flights[], hotels[], weather, weatherList,
//   budgetSummary, daysPlan[]
// }
```

**For Persistence (save to DB):**
```javascript
const json = tripBook.toJSON();
// Send to database
// On load:
const restored = TripBook.fromJSON(json);
```

---

## Common Mistakes

| ❌ WRONG | ✅ RIGHT | Why |
|---------|---------|-----|
| Pass entire object | Pass only changed fields (delta) | Incremental updates, not replacement |
| `days: [{ day: 1, segments: [] }, { day: 2, segments: null }]` | `days: [{ day: 1, segments: [] }, { day: 2 }]` | Don't send null segments, omit if not changing |
| `confirmed: true` + no date | `confirmed: true` + `confirmed_at` auto-set | Server auto-timestamps, no need to send |
| `phase: 3` alone | `phase: 3` + `itinerary: {...}` | Phase change should include itinerary data |
| Ask user "Confirm destination?" after ✅ | Use destination value directly | TripBook section says "勿重复询问" |
| `budget: { value: 2万, per_person: false }` (ambiguous) | `budget: { value: "2万", per_person: true, scope: "人均含机票" }` | Be explicit about scope |
| `segments: [{ title: "Eat" }]` (missing time) | `segments: [{ time: "19:00", title: "Eat", ... }]` | Time helps AI and UI sort activities |

---

## Data Flow at a Glance

```
User Input
    ↓
AI + System Prompt (includes TripBook context if exists)
    ↓
AI calls update_trip_info with {constraints, phase, itinerary}
    ↓
Tool validates + returns {success, updates, message}
    ↓
Server receives response, calls:
  • tripBook.updateConstraints(updates.constraints)
  • tripBook.updatePhase(updates.phase)
  • tripBook.updateItinerary(updates.itinerary)
    ↓
Server sends tripBook.toPanelData() to frontend via SSE/WebSocket
    ↓
Frontend right panel updates with new skeleton/details
    ↓
Next conversation turn:
    AI sees TripBook context in system prompt
    AI knows what's ✅ confirmed and what's ❓ pending
    AI doesn't re-ask confirmed info
    Conversation flows naturally toward completion
```

---

## File Locations

| What | File |
|------|------|
| TripBook model | `/models/trip-book.js` |
| update_trip_info tool | `/tools/update-trip-info.js` |
| System prompt builder | `/prompts/system-prompt.js` |
| Tool registry | `/tools/index.js` |
| Server integration | `/server.js` (or wherever tripBook is instantiated) |
| Frontend panel | (Check React components that consume `toPanelData()` output) |

