# DETAILED RENDERING FLOWCHART

## Complete SSE → Render Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│ Server (in runTool function, server.js lines 179-281)                  │
│                                                                         │
│ 1. AI calls update_trip_info tool with:                                │
│    {                                                                    │
│      "updates": {                                                       │
│        "constraints": { destination, departCity, dates, etc },         │
│        "phase": 5,                                                      │
│        "itinerary": {                                                   │
│          "route": ["Tokyo", "Kyoto", "Osaka"],                         │
│          "days": [{day, date, city, title, segments[]}, ...]          │
│        }                                                                │
│      }                                                                  │
│    }                                                                    │
│                                                                         │
│ 2. runTool() extracts tripBook and calls updateItinerary():           │
│    tripBook.updateConstraints(updates.constraints)                    │
│    tripBook.updatePhase(updates.phase)                                │
│    tripBook.updateItinerary(updates.itinerary)                        │
│                                                                         │
│ 3. Server sends SSE event:                                             │
│    sendSSE('tripbook_update', tripBook.toPanelData())                 │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
                              ↓ SSE Event Stream
                    (JSON data via HTTP streaming)
┌────────────────────────────────────────────────────────────────────────┐
│ Browser (chat.js, handleSSEEvent function)                             │
│                                                                         │
│ EventSource listener receives:                                         │
│   event: 'tripbook_update'                                             │
│   data: {                                                               │
│     destination: "Japan Tokyo·Kyoto·Osaka",                           │
│     departCity: "Beijing",                                             │
│     dates: "2024-05-01 ~ 2024-05-07",                                 │
│     days: 7,                                                            │
│     people: 2,                                                          │
│     budget: "15000",                                                    │
│     preferences: ["culture", "food", "shopping"],                      │
│     phase: 3,                                                           │
│     phaseLabel: "完善细节",                                             │
│     route: ["Tokyo", "Kyoto", "Osaka"],                               │
│     flights: [...],                                                     │
│     hotels: [...],                                                      │
│     weather: { city, temp_c, description },                           │
│     budgetSummary: {...},                                             │
│     daysPlan: [                                                         │
│       {                                                                 │
│         day: 1,                                                         │
│         date: "2024-05-01",                                            │
│         city: "Tokyo",                                                 │
│         title: "Arrival day",                                          │
│         segments: [                                                     │
│           {time, title, location, duration, type, ...},               │
│           {...}                                                         │
│         ]                                                               │
│       }                                                                 │
│     ]                                                                   │
│   }                                                                     │
│                                                                         │
│ handleSSEEvent('tripbook_update', data) called (line 313)             │
│   → updateFromTripBook(data) called (itinerary.js line 315)           │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
                              ↓ updateFromTripBook()
┌────────────────────────────────────────────────────────────────────────┐
│ itinerary.js, updateFromTripBook() (lines 299-340)                    │
│                                                                         │
│ 1. Merge data into itineraryState:                                    │
│    itineraryState.destination = data.destination                      │
│    itineraryState.departCity = data.departCity                        │
│    ... (all scalar fields)                                             │
│    itineraryState.route = data.route (array replacement)              │
│    itineraryState.daysPlan = data.daysPlan (array replacement)        │
│    itineraryState.budgetSummary = data.budgetSummary                  │
│    itineraryState.phase = mapPhase(data.phase)                        │
│                                                                         │
│ 2. Call renderItinerary()                                              │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
                              ↓ renderItinerary()
┌────────────────────────────────────────────────────────────────────────┐
│ itinerary.js, renderItinerary() (lines 110-231)                       │
│                                                                         │
│ Decision 1: hasData check                                              │
│ if (destination || departCity || dates || days || people ||           │
│     budget || preferences.length > 0 || phase > 0)                    │
│     → continue to Decision 2                                           │
│   else                                                                  │
│     → return (don't render anything)                                   │
│                                                                         │
│ Decision 2: hasRightCol check                                          │
│ if (route.length > 0 || daysPlan.length > 0 || budgetSummary)         │
│     → TWO-COLUMN layout                                                │
│   else                                                                  │
│     → SINGLE-COLUMN layout                                             │
│                                                                         │
│ Build LEFT column: constraints + bookings                              │
│   buildRow() for: destination, departCity, dates, people, budget,     │
│   preferences, weather, phase progress                                 │
│   + flights section                                                     │
│   + hotels section                                                      │
│                                                                         │
│ Build RIGHT column (if hasRightCol):                                   │
│   renderRoute(route)                                                    │
│   renderDaysPlan(daysPlan)                                             │
│   renderBudgetSummary(budgetSummary)                                   │
│                                                                         │
│ Assemble HTML: <div class="itin-two-col">                             │
│                  <div class="itin-col-left">...</div>                  │
│                  <div class="itin-col-right">...</div>                 │
│                </div>                                                   │
│                                                                         │
│ Set body.innerHTML = finalHtml                                         │
│ Bind event listeners to .itin-edit-btn elements                        │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
                              ↓ renderDaysPlan()
┌────────────────────────────────────────────────────────────────────────┐
│ itinerary.js, renderDaysPlan() (lines 377-415)                        │
│                                                                         │
│ For each day in daysPlan:                                              │
│                                                                         │
│   1. Check: isExpanded = expandedDays.has(d.day)                      │
│                                                                         │
│   2. Build header HTML:                                                │
│      <div class="itin-day-card [expanded]" id="day-card-N">           │
│        <div class="itin-day-header" onclick="toggleDay(N)">           │
│          <span class="day-num">Day N</span>                            │
│          <span class="day-date">2024-05-01</span>                     │
│          <span class="day-city">Tokyo</span>                           │
│          <span class="day-title">Arrival day</span>                    │
│          <span class="day-toggle">▶</span>                             │
│        </div>                                                           │
│                                                                         │
│   3. Check: hasSegments = d.segments && d.segments.length > 0         │
│                                                                         │
│      IF hasSegments:                                                   │
│        Call renderTimeline(d.segments)                                 │
│        Wrap in <div class="itin-day-detail">                           │
│                                                                         │
│      ELSE:                                                              │
│        Show <div class="itin-day-body">d.title</div>                   │
│                                                                         │
│   4. Close day card                                                    │
│      </div>                                                             │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
                              ↓ renderTimeline()
┌────────────────────────────────────────────────────────────────────────┐
│ itinerary.js, renderTimeline() (lines 420-469)                        │
│                                                                         │
│ <div class="timeline">                                                  │
│                                                                         │
│   FOR i = 0 to segments.length - 1:                                   │
│     segment = segments[i]                                              │
│     isLast = (i === segments.length - 1)                               │
│                                                                         │
│     Determine dotClass based on seg.type:                              │
│       'meal' → dotClass = 'meal' (#f59e0b amber)                       │
│       'transport' → dotClass = 'transport' (#64748b gray)              │
│       'hotel' → dotClass = 'hotel' (#8b5cf6 purple)                    │
│       default → dotClass = '' (#0891b2 cyan)                           │
│                                                                         │
│     Render timeline-item:                                              │
│     <div class="timeline-item">                                        │
│       <div class="timeline-time">14:30</div>                           │
│       <div class="timeline-dot-col">                                   │
│         <div class="timeline-dot [meal|transport|hotel]"></div>       │
│         [if !isLast] <div class="timeline-line"></div>                │
│       </div>                                                            │
│       <div class="timeline-content">                                   │
│         <div class="timeline-title">Activity Title</div>               │
│         <div class="timeline-meta">📍 Location · Duration · Notes     │
│       </div>                                                            │
│     </div>                                                              │
│                                                                         │
│     [if !isLast && seg.transport]                                      │
│       Render transport connector:                                      │
│       <div class="timeline-transport">                                 │
│         <div class="timeline-time"></div>                              │
│         <div class="timeline-dot-col">                                 │
│           <div class="timeline-line"></div>                            │
│         </div>                                                          │
│         <div class="transport-info">🚶 Train · 60min</div>             │
│       </div>                                                            │
│                                                                         │
│ </div>                                                                  │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
                              ↓ DOM Update
┌────────────────────────────────────────────────────────────────────────┐
│ Browser: HTML rendered on screen                                       │
│                                                                         │
│ ┌─ Itinerary Panel ──────────────────────────────────────────────────┐ │
│ │ 行程概览                                                           │ │
│ ├──────────────────────────────────────────────────────────────────┤ │
│ │ ┌─ Left Column (2fr) ──┬─ Right Column (3fr) ─────────────────┐ │ │
│ │ │                      │                                         │ │
│ │ │ 📍 Japan             │ 🗺️ Tokyo → Kyoto → Osaka             │ │
│ │ │ 🛫 Beijing           │                                         │ │
│ │ │ 📅 2024-05-01 ~ 07   │ 📋 Daily Itinerary                     │ │
│ │ │ 👥 2 people          │ ┌─────────────────────────────────┐    │ │
│ │ │ 💰 15000 CNY         │ │ Day 1    2024-05-01    Tokyo    │ ▶ │ │
│ │ │ 🏷️ culture, food     │ │ Arrival day                      │    │ │
│ │ │ 📊 Phase progress    │ │                                  │    │
│ │ │ ✈️ Flights           │ │ ┌─────────────────────────────┐ │    │ │
│ │ │ 🏨 Hotels            │ │ │ Timeline (expanded)         │ │    │ │
│ │ │                      │ │ │                             │ │    │ │
│ │ │                      │ │ │ 14:30 ● Arrival at airport │ │    │ │
│ │ │                      │ │ │       |                     │ │    │ │
│ │ │                      │ │ │ 16:00 ● Check in hotel      │ │    │ │
│ │ │                      │ │ │       |                     │ │    │ │
│ │ │                      │ │ │ 19:00 ◆ Dinner              │ │    │ │
│ │ │                      │ │ │                             │ │    │ │
│ │ │                      │ │ └─────────────────────────────┘ │    │ │
│ │ │                      │ │                                  │    │ │
│ │ │                      │ │ [more days...]                   │    │ │
│ │ │                      │ │                                  │    │ │
│ │ │                      │ │ 💰 Budget Summary                │    │ │
│ │ │                      │ │ Flights: ¥3500                   │    │ │
│ │ │                      │ │ Hotels: ¥4200                    │    │ │
│ │ │                      │ │ Total: ¥12200                    │    │ │
│ │ │                      │ │ Remaining: ¥2800                 │    │ │
│ │ │                      │ └─────────────────────────────────┘    │ │
│ │ │                      │                                         │ │
│ │ └──────────────────────┴─────────────────────────────────────────┘ │
│ └──────────────────────────────────────────────────────────────────────┘
│                                                                         │
│ User can:                                                              │
│   - Click day header to toggle expand/collapse                         │
│   - Click edit pencil on certain fields to inline edit                 │
│   - Scroll left/right columns independently                            │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Day Card Expansion Toggle Flow

```
User clicks on .itin-day-header
        ↓
JavaScript event handler: toggleDay(dayNum) (line 391)
        ↓
Toggle: expandedDays.has(dayNum) ?
  YES → expandedDays.delete(dayNum)
  NO  → expandedDays.add(dayNum)
        ↓
Update DOM:
  document.getElementById(`day-card-${dayNum}`)
    .classList.toggle('expanded', expandedDays.has(dayNum))
        ↓
CSS automatically handles:
  .itin-day-card.expanded .itin-day-detail {
    display: block;  ← Shows timeline
  }
  .itin-day-card.expanded .day-toggle {
    transform: rotate(90deg);  ← Rotates arrow
  }
        ↓
Visual change (NO full re-render!)
```

---

## State Persistence Across Re-renders

```
Initial render:
  expandedDays = Set() → empty, all days collapsed

User clicks Day 1 header:
  expandedDays.add(1) → Set { 1 }
  Day 1 shows .expanded class

AI sends new daysPlan data:
  updateFromTripBook() called
    → itineraryState.daysPlan = newData
    → renderItinerary() called
    → renderDaysPlan() iterates newData:
        for (const d of daysPlan) {
          const isExpanded = expandedDays.has(d.day)  ← Still has 1!
          if (isExpanded) expandedClass = ' expanded'
          html += `<div class="itin-day-card${expandedClass}" ...`
        }

Result: Day 1 remains expanded in new render ✓
```

---

## Segment Existence Decision Tree

```
renderDaysPlan() for day d:

hasSegments = d.segments && d.segments.length > 0

  ├─ TRUE (e.g., d.segments = [{time, title, ...}, {...}])
  │   │
  │   ├─ Call renderTimeline(d.segments)
  │   ├─ HTML: <div class="itin-day-detail"><div class="timeline">
  │   ├─ User sees: Detailed timeline with dots/lines/times/activities
  │   └─ User can: Click to expand/collapse, see all activities
  │
  └─ FALSE (d.segments undefined/null/empty array)
      │
      ├─ Show: <div class="itin-day-body">d.title</div>
      ├─ HTML: Just text, no timeline
      ├─ User sees: Collapsed summary view
      └─ User can: Click to expand but no detailed content shows
```
