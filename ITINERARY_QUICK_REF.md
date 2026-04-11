# Itinerary Panel UI — Quick Reference

## 🎯 File Map

```
public/js/itinerary.js (437 lines)
  ├─ itineraryState (lines 6-23)         ← 22 fields including TripBook extensions
  ├─ updateItinerary() (lines 45-80)     ← Incremental updates
  ├─ updateFromTripBook() (lines 302-344) ← SSE data handler
  ├─ renderItinerary() (lines 108-230)   ← MAIN: builds all HTML
  ├─ renderRoute() (lines 349-360)       ← Route visualization
  ├─ renderDaysPlan() (lines 365-384)    ← Daily itinerary cards
  └─ renderBudgetSummary() (lines 389-424) ← Budget breakdown

public/css/style.css (262 lines of itinerary CSS)
  ├─ .itinerary-panel (lines 64-71)      ← Container: 380px, dark theme
  ├─ .itin-row (lines 113-180)           ← Basic field layout
  ├─ .itin-booking-card (lines 215-234)  ← Flight/hotel cards
  ├─ .itin-day-card (lines 258-296)      ← Daily itinerary cards (light theme)
  └─ .itin-budget (lines 299-324)        ← Budget display

models/trip-book.js (52 lines)
  └─ toPanelData() (lines 426-477)       ← Data export for frontend
```

## 📊 State Structure at a Glance

```javascript
itineraryState = {
  // Basic info (strings/numbers)
  destination: '',         // e.g., "日本 东京·京都·大阪"
  departCity: '',          // e.g., "北京"
  dates: '',               // e.g., "2024-04-15 ~ 2024-04-22"
  days: 0,                 // e.g., 8
  people: 0,               // e.g., 2
  budget: '',              // e.g., "¥50000"
  preferences: [],         // e.g., ["美食", "温泉"]
  weather: null,           // {city, temp_c, description}
  
  // Progress
  phase: 0,                // 0-4 (mapped from 0-7 internally)
  phaseLabel: '',          // e.g., "完善细节"
  
  // Bookings
  flights: [],             // [{route, airline, price, time, status}]
  hotels: [],              // [{name, city, price, nights, status}]
  
  // TripBook extensions
  route: [],               // e.g., ["东京", "京都", "大阪"]
  daysPlan: [],            // [{day, date, city, title, segmentCount}]
  budgetSummary: null      // {flights, hotels, ..., total_cny, budget_cny}
}
```

## 🎨 Visual Layout (380px wide)

```
┌─────────────────────────┐
│  ✈️ ITINERARY PANEL    │ ← header: fixed 56px
├─────────────────────────┤
│ 📍 Destination          │ ← basic field rows (~30px each)
│ 🛫 Depart City          │
│ 📅 Dates + Days         │
│ 👥 People               │
│ 💰 Budget               │
│ 🏷️ Preferences          │ ← tags inline
│ 🌤️ Weather              │
│ 📊 Progress             │ ← 4-segment bar with animation
├─────────────────────────┤
│ ✈️ FLIGHTS              │ ← section titles (uppercase, gray)
│ ┌─────────────────────┐ │
│ │ BJ→TYO              │ │ ← booking cards (dark bg)
│ │ ANA · ¥4500 · 11h   │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ 🏨 HOTELS               │
│ ┌─────────────────────┐ │
│ │ Hotel Name          │ │ ← booking cards
│ │ Tokyo · ¥800/night  │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ 🗺️ ROUTE                │
│ 🔵Tokyo 🔵Kyoto 🔵Osaka │ ← pills with arrows
├─────────────────────────┤
│ 📋 DAILY ITINERARY      │
│ ┌─────────────────────┐ │
│ │ Day 1 | 2024-04-15  │ │ ← day cards (light bg!)
│ │ Tokyo - Arrival     │ │
│ │ 2 activities        │ │
│ └─────────────────────┘ │
├─────────────────────────┤
│ 💰 BUDGET SUMMARY       │
│ Flights         ¥9,000  │ ← budget lines
│ Hotels         ¥24,000  │
│ ──────────────────────  │
│ Total          ¥50,000  │
│ Remaining      ¥0       │ ← green if +, red if -
└─────────────────────────┘
```

## 🔄 Data Flow

```
SSE Event "tripbook_update" with toPanelData()
  ↓
updateFromTripBook(data)
  ├─ Merge simple fields
  ├─ Map phase 0-7 → 1-4
  ├─ Replace arrays (flights, hotels, daysPlan)
  └─ Merge route, budgetSummary
  ↓
renderItinerary()
  ├─ Check if data exists
  ├─ Build HTML string
  ├─ Set #itinerary-body.innerHTML
  └─ Bind edit button events
  ↓
DOM Updated → User sees panel
```

## 🎛️ Key Functions

### `renderItinerary()` — The Main Renderer
- **Lines:** 108-230 in itinerary.js
- **Purpose:** Builds entire panel HTML based on `itineraryState`
- **Strategy:** Conditional rendering (only include sections with data)
- **Security:** All strings escaped via `escItinHtml()`

### `updateFromTripBook(data)` — SSE Handler
- **Lines:** 302-344 in itinerary.js
- **Purpose:** Receives data from server, updates state, triggers render
- **Behavior:** Full replace for flights/hotels/daysPlan, direct assign for simple fields

### `toPanelData()` — Server Data Export
- **Lines:** 426-477 in trip-book.js
- **Purpose:** Flattens TripBook data into panel-ready format
- **Output:** Single flat object with 14 top-level keys

## 🎨 CSS Highlights

| Class | Type | Key Props | Line |
|-------|------|-----------|------|
| `.itinerary-panel` | Container | width: 380px; dark bg gradient | 64 |
| `.itin-row` | Flex row | icon(28px) label(52px) value(flex) btn | 113 |
| `.itin-booking-card` | Card | dark bg, border, padding 10px 14px | 215 |
| `.route-stop` | Pill | light blue bg, inline-block | 242 |
| `.itin-day-card` | Card | light bg (#f8fafc), contrasts with panel | 258 |
| `.itin-progress-seg.active` | Segment | cyan bg, pulsing animation | 197 |

## 📦 Data Shapes

### Flight Object
```js
{ route, airline, price, time, status }
// Example: { route: "BJ→TYO", airline: "ANA", price: "¥4500", time: "11h", status: "selected" }
```

### Hotel Object
```js
{ name, city, price, nights, status }
// Example: { name: "Hilton", city: "Tokyo", price: "¥800/night", nights: 3, status: "booked" }
```

### Day Object
```js
{ day, date, city, title, segmentCount }
// Example: { day: 1, date: "2024-04-15", city: "Tokyo", title: "Arrival", segmentCount: 2 }
```

### Budget Summary Object
```js
{
  total_cny: number,
  budget_cny: number,
  remaining_cny: number,  // optional
  flights: { label, amount_cny },
  hotels: { label, amount_cny },
  attractions: { label, amount_cny },
  meals: { label, amount_cny },
  transport: { label, amount_cny },
  misc: { label, amount_cny }
}
```

## 🔧 Edit Functionality

- **Trigger:** Hover on `.itin-row` → `.itin-edit-btn` appears
- **Click:** Replaces value with inline input (`.itin-inline-input`)
- **Commit:** On blur or Enter key
- **Effect:** Populates chat input with "field改为newvalue"
- **Render:** `renderItinerary()` called to reset

## 🎯 What's Missing / Opportunities

- [ ] Multi-column layout (currently 380px single column)
- [ ] Keyboard navigation (edit buttons not tab-accessible)
- [ ] ARIA labels for accessibility
- [ ] Form semantics in inline editor
- [ ] Performance optimization (could use virtualization for long lists)
- [ ] Visual indicators for "status" field (selected, booked, etc.)

## 🚀 Quick Edits

**To add a new field to panel:**
1. Add to `itineraryState` (line 6-23)
2. Add rendering logic in `renderItinerary()` (line 108+)
3. Add merge logic in `updateFromTripBook()` (line 302+)
4. Add to `toPanelData()` return (trip-book.js 426+)
5. Add CSS if needed

**To change layout:**
1. Modify `.itinerary-panel` width/display
2. Adjust `.itin-row` column proportions (icon, label widths)
3. Reorganize HTML generation in `renderItinerary()`

**To add new section:**
1. Create `render<SectionName>()` function (follow `renderRoute` pattern)
2. Call from `renderItinerary()` line 207+
3. Add CSS classes for styling
4. Add to `toPanelData()` export

