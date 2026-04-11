# AI Travel Planner — Itinerary Panel Implementation Report

**Date**: April 2026  
**Scope**: Complete architectural exploration for major redesign  
**Files**: itinerary.js, style.css, trip-book.js, server.js, index.html

---

## Table of Contents
1. [Frontend State Architecture](#1-frontend-state-architecture)
2. [Rendering Architecture](#2-rendering-architecture)
3. [Data Flow](#3-data-flow)
4. [CSS Styling System](#4-css-styling-system)
5. [TripBook Backend Integration](#5-tripbook-backend-integration)
6. [Helper Functions & Utilities](#6-helper-functions--utilities)
7. [Key Design Patterns](#7-key-design-patterns)
8. [Limitations & Opportunities](#8-limitations--opportunities)

---

## 1. Frontend State Architecture

### 1.1 Core State Object: `itineraryState` (Lines 6-24)

```javascript
let itineraryState = {
  // ═ Basic Trip Info ═
  destination: '',           // Destination name (can include cities: "日本（东京·京都·大阪）")
  departCity: '',            // Departure city
  dates: '',                 // Date range as string: "2024-05-01 ~ 2024-05-07"
  days: 0,                   // Total number of days
  people: 0,                 // Number of travelers
  budget: '',                // Budget value as string: "2万元"
  preferences: [],           // Array of preference tags: ["文化体验", "美食", "购物"]
  
  // ═ Planning Phase ═
  phase: 0,                  // Internal phase (0-4 mapped from backend 0-7)
  phaseLabel: '',            // Localized phase name: "需求确认", "大交通确认", etc.
  
  // ═ Booking Options ═
  flights: [],               // Array of flight quotes (accumulated)
  hotels: [],                // Array of hotel quotes (accumulated)
  
  // ═ Dynamic Data ═
  weather: null,             // Single weather entry: { city, temp_c, description }
  weatherList: null,         // Multi-city weather: [{ city, temp_c, description }, ...]
  
  // ═ TripBook Extended Fields ═
  route: [],                 // Route array: ["东京", "京都", "大阪"]
  daysPlan: [],              // Daily itinerary: [{ day, date, city, title, segments[] }, ...]
  budgetSummary: null        // Budget breakdown: { flights, hotels, ..., total_cny, remaining_cny }
};
```

**Key Observations:**
- **Incremental accumulation**: `flights` and `hotels` are appended to, not replaced
- **Phase mapping**: Frontend receives 0-4, backend sends 0-7 (see `mapPhase()` at line 83-89)
- **Dual weather storage**: Single city (`weather`) vs. multi-city (`weatherList`)
- **Route is a flat array**: No nesting of dates or segments at this level

---

## 2. Rendering Architecture

### 2.1 Main Render Function: `renderItinerary()` (Lines 156-290)

**Location in Panel (Vertical Order):**
```
1. Destination Title           (line 170)    → `.itin-dest-title`
2. Route Bar                   (line 174)    → `.itin-route-bar`
3. Basic Info Grid (2 col)     (line 199)    → `.itin-info-grid` (dates, people, budget, depart)
4. Preference Tags             (line 212)    → `.itin-tags-bar`
5. Weather                     (line 218)    → `.itin-weather-bar` (multi-city support)
6. Phase Progress              (line 230)    → `.itin-progress-bar`
7. Flights Section             (line 245)    → `.itin-section-title` + `.itin-booking-card`
8. Hotels Section              (line 258)    → `.itin-section-title` + `.itin-booking-card`
9. Daily Itinerary             (line 271)    → renderDaysPlan()
10. Budget Summary             (line 276)    → renderBudgetSummary()
```

**Critical Logic (Line 162-164):**
```javascript
const hasData = s.destination || s.departCity || s.dates || s.days ||
                s.people || s.budget || s.preferences.length > 0 || s.phase > 0;
if (!hasData) return;  // Early exit if empty
```
*The panel only renders if at least one field has data*

### 2.2 Daily Itinerary Rendering: `renderDaysPlan()` (Lines 498-543)

**Data Structure Expected:**
```javascript
daysPlan: [
  {
    day: 1,                        // Day number
    date: "2024-05-01",           // Date string
    city: "东京",                  // City name
    title: "到达东京，入住酒店", // Day overview
    segments: [                    // Collapsible timeline
      {
        time: "10:00",            // Departure/start time
        title: "到达羽田机场",     // Activity title
        location: "羽田机场",      // Location
        duration: "30分钟",        // Duration
        transport: "",            // Not used in segments
        transportTime: "",        // Not used in segments
        notes: "取行李，前往市区", // Additional notes
        type: "activity"          // Type: "activity" | "meal" | "transport" | "hotel"
      },
      ...
    ]
  },
  ...
]
```

**Rendering Features:**
- **Collapsible cards** with toggle state tracked in `expandedDays` Set (line 27)
- **"全部展开/收起" button** (line 511) only shown if any day has segments
- **Toggle animation** via `.itin-day-card.expanded` (CSS line 430-432)
- **Subtitle display** (line 530-531): Day title shown below header (no truncation)

**Expand/Collapse Logic:**
```javascript
function toggleDay(dayNum) {
  if (expandedDays.has(dayNum)) {
    expandedDays.delete(dayNum);
  } else {
    expandedDays.add(dayNum);
  }
  // Only toggle class, don't re-render entire panel
  const card = document.getElementById(`day-card-${dayNum}`);
  if (card) {
    card.classList.toggle('expanded', expandedDays.has(dayNum));
  }
  updateToggleAllText();
}
```

### 2.3 Timeline Rendering: `renderTimeline()` (Lines 548-597)

**Grid Layout (CSS Line 461-463):**
```css
grid-template-columns: 44px 14px 1fr;
gap: 4px;
```
- **44px**: Time display (right-aligned)
- **14px**: Dot + line column (centered)
- **1fr**: Content (title, location, notes)

**Segment Dot Types (Line 555-557, CSS 488-490):**
```javascript
const dotClass = seg.type === 'meal' ? 'meal' :
                 seg.type === 'transport' ? 'transport' :
                 seg.type === 'hotel' ? 'hotel' : '';
```
- `.meal` → Orange (#f59e0b)
- `.transport` → Gray (#64748b, no shadow)
- `.hotel` → Purple (#a78bfa)
- Default → Blue (#3b82f6)

**Transport Connector (Line 581-592):**
```javascript
// Shows between activities if seg.transport is defined
if (!isLast && seg.transport) {
  const transportText = seg.transportTime
    ? `${seg.transport} · ${seg.transportTime}`
    : seg.transport;
  // Renders as separate grid row with 🚶 prefix
}
```

### 2.4 Budget Summary: `renderBudgetSummary()` (Lines 602-647)

**Data Structure:**
```javascript
budgetSummary: {
  // Meta fields (not rendered as items)
  total_cny: 45000,
  budget_cny: 50000,
  remaining_cny: 5000,
  
  // Known order rendering (line 609)
  flights: { label: "机票", amount_cny: 15000 },
  hotels: { label: "酒店", amount_cny: 12000 },
  accommodation: { ... },
  attractions: { ... },
  meals: { ... },
  transport: { ... },
  
  // Any additional AI-generated categories
  insurance: { label: "保险", amount_cny: 500 }
}
```

**Rendering Strategy (Line 625-629):**
1. First: Render known keys in predefined order
2. Then: Render any remaining keys (AI may add new categories)
3. Total always shown with `.budget-total` class
4. Remaining/overspend shown with `.budget-ok` (green) or `.budget-over` (red)

---

## 3. Data Flow

### 3.1 Update Paths

**Path 1: `updateItinerary(data)` (Lines 94-127)**
- Called by: `handleSSEEvent('itinerary_update', data)`
- **Incremental merge** for flights/hotels (push, don't replace)
- Fields directly assigned: destination, departCity, dates, days, people, budget
- Phase is mapped via `mapPhase()`
- Preferences are merged (new tags added to set, deduplicated)
- Always calls `renderItinerary()` at end

**Path 2: `updateFromTripBook(data)` (Lines 404-453)**
- Called by: `handleSSEEvent('tripbook_update', data)` in chat.js line 323
- **Complete replacement** for flights, hotels, route, daysPlan
- Handles snapshot reconstruction via `convertSnapshotToPanelData()` (line 408-409)
- Used for session restore and TripBook state sync
- More authoritative than `updateItinerary()`

**Path 3: `convertSnapshotToPanelData(snap)` (Lines 343-399)**
- Converts full TripBook snapshot format → panel-friendly format
- Extracts from: `constraints`, `itinerary`, `dynamic`
- Constructs destination string with cities in parentheses
- Filters weather entries by TTL (line 347-362)
- Maps flight/hotel quotes to display format with prices

### 3.2 Data Flow Diagram

```
Backend (server.js, trip-book.js)
    ↓
SSE Event: tripbook_update
    ↓ (chat.js line 314-326)
sessionStorage (tp_tripbook_snapshot + tp_tripbook)
    ↓
updateFromTripBook() [primary]
    or
updateItinerary() [secondary]
    ↓
itineraryState
    ↓
renderItinerary()
    ↓
DOM (itinerary-panel)
```

---

## 4. CSS Styling System

### 4.1 CSS Classes Hierarchy

**Panel Container:**
- `.itinerary-panel` (line 81-89): Dark indigo gradient background, 30vw width
- `.itinerary-header` (line 103): Header bar with title
- `.itinerary-body` (line 122): Scrollable content area

**Destination & Route:**
- `.itin-dest-title` (line 150-160): Large gradient text (blue to light blue)
- `.itin-route-bar` (line 163-169): Flexbox with wrap
- `.route-stop` (line 362-371): Rounded badge with gradient bg
- `.route-arrow` (line 372-376): Gray arrow separator

**Basic Info Grid:**
- `.itin-info-grid` (line 172-177): 2-column grid, gap 6px
- `.itin-info-item` (line 178-221):
  - Flex layout with icon, text, edit button
  - Hover: background changes to blue, border becomes blue
  - `.itin-edit-btn`: Hidden until hover, shows pencil emoji
- `.itin-inline-input` (line 250-260): For inline field editing

**Tags & Weather:**
- `.itin-tags-bar` (line 224-229): Flex row with emoji prefix
- `.itin-tag` (line 285-295): Inline-block badge with blue background
- `.itin-weather-bar` (line 232-236): Similar layout to tags-bar

**Progress:**
- `.itin-progress-bar` (line 239-242): Contains text and progress segments
- `.itin-progress` (line 298-301): Flex row with 3px gap
- `.itin-progress-seg` (line 302-314):
  - Default: translucent white (opacity 0.08)
  - `.done`: Blue gradient
  - `.active`: Pulsing animation (itinPulse)

**Sections:**
- `.itin-section-title` (line 321-328): Uppercase, small, gray, letter-spaced
- `.itin-booking-card` (line 329-354):
  - Translucent white background
  - Left border in blue (3px)
  - Hover: darker background, full blue left border
  - Contains `.itin-booking-title` and `.itin-booking-detail`

**Daily Cards:**
- `.itin-day-card` (line 379-455):
  - Translucent white background with border
  - Has `.has-segments` class if expandable
  - `.expanded` class toggles content visibility
- `.itin-day-header` (line 391-403):
  - Flex layout: day number, date, city, toggle arrow
  - Cursor pointer if `.has-segments`
  - Hover background on `.has-segments` variants
- `.day-num` (line 404-413): Blue gradient badge with shadow
- `.day-toggle` (line 423-432): Arrow that rotates 90° when expanded
- `.itin-day-subtitle` (line 433-438): Gray text below header
- `.itin-day-detail` (line 439-445): Hidden by default, shown when `.expanded`

**Timeline:**
- `.timeline` (line 457-459): Padding container
- `.timeline-item` (line 460-466): 3-column grid (time, dot, content)
- `.timeline-time` (line 467-473): Right-aligned, monospace numbers
- `.timeline-dot-col` (line 474-479): Flex column, centered
- `.timeline-dot` (line 480-490):
  - 8px circle with shadow
  - Variants: `.meal` (orange), `.transport` (gray), `.hotel` (purple)
- `.timeline-line` (line 491-496): Vertical connector (2px, semi-transparent)
- `.timeline-content` (line 497-500): Title and meta
- `.timeline-meta` (line 507-511): Small gray text, emoji+data format
- `.timeline-transport` (line 512-527): Separate grid for transport info

**Budget:**
- `.itin-budget` (line 531-533): Container padding
- `.budget-item` (line 534-548):
  - Flex between: label ← amount
  - Monospace numbers
- `.budget-total` (line 549-555): Border-top, bold, cyan text
- `.budget-ok` (line 556): Green amount (¥5000)
- `.budget-over` (line 557): Red amount (¥-2000)

### 4.2 Theme Variables (Lines 8-40)

**Color Palette:**
```css
--arctic-start: #3b82f6;        /* Bright blue */
--arctic-mid: #2563eb;          /* Medium blue */
--arctic-end: #1d4ed8;          /* Dark blue */
--slate-deep: #0f172a;          /* Very dark (panel bg base) */
--slate-mid: #1e293b;           /* Medium dark (panel bg layer) */
--slate-light: #93c5fd;         /* Light blue (text accent) */
--frost: #f8fafc;               /* Off-white */

/* Functional */
--primary: #3b82f6;             /* Blue */
--success: #059669;             /* Green for budget OK */
--warning: #d97706;             /* Orange for meals */
```

### 4.3 Key Animations

**itinPulse** (Line 315-318):
```css
@keyframes itinPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```
Applied to active progress segment

---

## 5. TripBook Backend Integration

### 5.1 TripBook Class Structure (models/trip-book.js)

**Layer Architecture:**
```
Layer 1: Knowledge References
  - knowledgeRefs: ["日本", "清迈"]
  - activityRefs: ["潜水"]

Layer 2: Dynamic Data (with TTL)
  - weather: { cityKey → { city, current, forecast, _meta } }
  - exchangeRates: { "JPY_CNY" → { from, to, rate, ... } }
  - flightQuotes: [{ id, route, date, airline, price_usd, price_cny, ... }]
  - hotelQuotes: [{ id, name, city, checkin, checkout, nights, ... }]
  - webSearches: [{ query, summary, fetched_at }]

Layer 3: User Constraints (confirmed flags)
  - destination: { value, cities[], confirmed, confirmed_at }
  - departCity: { value, airports[], confirmed, confirmed_at }
  - dates: { start, end, days, flexible, confirmed, confirmed_at }
  - people: { count, details, confirmed, confirmed_at }
  - budget: { value, per_person, currency, confirmed, confirmed_at }
  - preferences: { tags[], notes, confirmed, confirmed_at }
  - specialRequests: [{ type, value, confirmed }]
  - _history: [{ field, from, to, changed_at, reason }]

Layer 4: Structured Itinerary
  - phase: 0-7
  - phaseLabel: Localized string
  - route: ["東京", "京都", "大阪"]
  - days: [{ day, date, city, title, segments[] }]
  - budgetSummary: { flights, hotels, ..., total_cny, ... }
  - reminders: ["出发前3天完成Visit Japan Web注册"]
```

### 5.2 toPanelData() Method (Lines 430-494)

**Transformation Logic:**

| TripBook Path | Panel Field | Notes |
|---|---|---|
| `constraints.destination.value` → destination string | With cities in parens if available |
| `constraints.departCity.value` | departCity | Direct |
| `constraints.dates.start/end` | dates | Combined as "start ~ end" |
| `constraints.dates.days` | days | Direct |
| `constraints.people.count` | people | Direct |
| `constraints.budget.value` | budget | Direct |
| `constraints.preferences.tags` | preferences | Array direct |
| `itinerary.phase` | phase | Direct |
| `itinerary.route` | route | Array direct |
| `dynamic.weather` entries | weatherList | Mapped to { city, temp_c, description } |
| `dynamic.flightQuotes` | flights | Filtered + formatted |
| `dynamic.hotelQuotes` | hotels | Filtered + formatted |
| `itinerary.days` | daysPlan | Deep mapped with segments |
| `itinerary.budgetSummary` | budgetSummary | Direct |

**Flight Quote Mapping (Line 466-470):**
```javascript
route: f.route,                      // "东京 → 大阪"
airline: f.airline,                  // "JAL"
price: f.price_cny ? `¥${f.price_cny}` : `$${f.price_usd}`,
time: f.duration,                    // "10h 30m"
status: f.status,                    // "quoted" | "selected" | "booked"
```

**Hotel Quote Mapping (Line 472-476):**
```javascript
name: h.name,                        // "Park Hyatt Tokyo"
city: h.city,                        // "Tokyo"
price: h.price_total_cny ? `¥${h.price_total_cny}` : `$${h.price_per_night_usd}/晚`,
nights: h.nights,                    // 2
status: h.status,                    // "quoted" | "selected"
```

**Segment Mapping (Line 482-491):**
```javascript
time: seg.time || '',                // "10:00"
title: seg.title || seg.activity || '',
location: seg.location || '',        // "羽田机场"
duration: seg.duration || '',        // "30分钟"
transport: seg.transport || '',      // Not used in display
transportTime: seg.transportTime || '',  // Between-activity time
notes: seg.notes || '',              // "取行李"
type: seg.type || 'activity'         // Determines dot color
```

### 5.3 updateConstraints() Method (Lines 140-179)

**Merge Strategy:**
```javascript
// Shallow merge: retains old fields, new values override
this.constraints[field] = oldVal ? { ...oldVal, ...newVal } : newVal;
```
- Preserves unmodified sub-fields
- Records changes in `_history` array
- Auto-sets `confirmed_at` timestamp

### 5.4 updateItinerary() Method (Lines 199-239)

**Days Merge Strategy (Line 212-225):**
```javascript
// Find day by day number
const idx = this.itinerary.days.findIndex(d => d.day === newDay.day);
if (idx >= 0) {
  // Merge strategy: if new segments empty, keep old ones
  if (existing.segments?.length > 0 && (!newDay.segments || newDay.segments.length === 0)) {
    merged.segments = existing.segments;  // ← Preserve partial updates
  }
}
```
*Prevents accidental loss of segments during partial updates*

### 5.5 toSystemPromptSection() Method (Lines 398-420)

**Generates injection text** for AI system prompt with:
1. Cached dynamic data (weather, rates, searches)
2. Confirmed user constraints
3. Current itinerary progress
4. Phase information

---

## 6. Helper Functions & Utilities

### 6.1 Weather Translation (Lines 37-53)

**WEATHER_ZH Object (Lines 38-49):**
- Maps English descriptions to Chinese
- Examples: 'Clear' → '晴', 'Thunderstorm' → '雷暴'
- ~30 entries covering common conditions

**CITY_ZH Object (Lines 56-76):**
- Maps 80+ cities: lowercase English → Chinese
- Examples: 'tokyo' → '东京', 'busan' → '釜山'

**Usage:**
```javascript
const desc = translateWeather(data.current.description);
const cityName = translateCity(w.city);
```

### 6.2 Phase Mapping (Lines 83-89)

**Internal → Display Mapping:**
```javascript
function mapPhase(raw) {
  if (raw <= 0) return 0;        // Not started
  if (raw <= 1) return 1;        // Requirements confirm
  if (raw <= 2) return 2;        // Transportation confirm
  if (raw <= 4) return 3;        // Itinerary planning
  return 4;                      // Summary
}
```
Backend sends 0-7, frontend displays 0-4 (compressed phases)

### 6.3 HTML Escape (Lines 652-659)

```javascript
function escItinHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```
**Prevents XSS** in all rendered content

### 6.4 Inline Edit (Lines 295-338)

**startInlineEdit(btn)** allows editing of:
- departCity, dates, people, budget

**Workflow:**
1. Click pencil emoji on info item
2. Input field appears in-place
3. On blur/Enter: constructs prompt message
4. Sets msg-input value and focuses
5. User can review before sending

**Generated prompt examples:**
- "出发城市改为北京"
- "预算改为3万元"

---

## 7. Key Design Patterns

### 7.1 Incremental State Updates

**updateItinerary()**: Accumulates flights/hotels
```javascript
if (data.flights && data.flights.length > 0) {
  itineraryState.flights.push(...data.flights);  // Append, not replace
}
```

**updateFromTripBook()**: Replaces entire collections
```javascript
if (Array.isArray(data.flights)) {
  itineraryState.flights = data.flights;  // Replace entirely
}
```
*Different semantics for different data sources*

### 7.2 Lazy Rendering

**Early exit (Line 162-164):**
```javascript
if (!hasData) return;  // Don't render if completely empty
```
*Prevents rendering blank panel during startup*

**Selective visibility:**
- Toggle all button only shown if any day has segments (Line 510)
- Preference tags only shown if array non-empty (Line 212)
- Weather only shown if data exists (Line 218-227)

### 7.3 Collapse State Management

**Global Set** (Line 27):
```javascript
const expandedDays = new Set();  // Persists across renderItinerary() calls
```
- Store IDs of expanded days
- Survives panel re-renders
- Survives state updates
- **Not persisted** to localStorage (resets on page reload)

### 7.4 Two-Layer Data Translation

**Layer 1**: TripBook.toPanelData() (backend)
```javascript
// Comprehensive transformation:
// constraints → simple flat strings
// dynamic → formatted prices
// itinerary.days → mapped segments
```

**Layer 2**: convertSnapshotToPanelData() (frontend)
```javascript
// Fallback: handles full snapshot format
// Used for session restore
// Less frequently used
```

### 7.5 Markdown City/Weather Names

**Double translation:**
1. Backend provides English names from API
2. Frontend translates: English → Chinese display
3. Supports multi-city dashboard

---

## 8. Limitations & Opportunities

### 8.1 Current Limitations

**Data Structure:**
- ❌ Route is flat array (no metadata per stop: dates, hotels, attractions)
- ❌ Days don't link to flights/hotels (manual connection)
- ❌ Budget summary is flat (no hierarchical categories)
- ❌ Segments have no IDs (hard to track updates)
- ❌ No relationships between entities (flight X covers dates Y-Z)

**UI/UX:**
- ❌ Collapsed state not persisted (resets on refresh)
- ❌ No edit capability for daily plan items
- ❌ Flights/hotels just listed, not linked to days
- ❌ Weather only shows current conditions (no forecast)
- ❌ Preferences shown as tags only, no structured details
- ❌ No comparison view for multiple quotes

**Performance:**
- ⚠️ Full re-render on every update (could be expensive with large itineraries)
- ⚠️ Accumulates flights/hotels indefinitely (old quotes never pruned)

**Integration:**
- ❌ No two-way sync (edits in panel don't update backend)
- ❌ No undo/redo for edits
- ❌ Limited validation before committing edits

### 8.2 Opportunities for Redesign

**Architecture:**
1. **Linked entities**: Add IDs and references
   - Flight { id, dates_covered: [day1, day2, ...] }
   - Hotel { id, city, dates_covered: date_range }
   - Day { flights: [id1], hotels: [id2] }

2. **Hierarchical budget**:
   ```json
   {
     "categories": {
       "flights": { items: [{}, {}], subtotal: 15000 },
       "accommodations": { items: [{}, {}], subtotal: 12000 }
     },
     "total": 45000
   }
   ```

3. **Structured preferences**:
   ```json
   {
     "activity_types": ["潜水", "文化"],
     "pace": "relaxed",
     "accommodation_style": "luxury",
     "meal_budget": "high"
   }
   ```

**UI Improvements:**
1. **Tab or accordion interface**: Separate sections (Overview, Flights, Hotels, Daily Plan, Budget)
2. **Calendar view**: Visual timeline of events
3. **Map integration**: Route visualization
4. **Responsive cards**: Show/hide detail levels
5. **In-place editing**: Direct panel edits without input field
6. **Comparison mode**: Side-by-side flight/hotel options
7. **Export options**: PDF, iCal, sharing links
8. **Notifications**: Alerts for weather changes, price drops
9. **Mobile-optimized**: Drawer vs. panel for smaller screens

**Data Flow:**
1. **Bidirectional sync**: Panel edits → backend updates → panel refresh
2. **Conflict resolution**: Handle simultaneous AI planning + manual edits
3. **Change history**: Audit trail of modifications
4. **Undo/redo**: At least one level of revert
5. **Collaborative notes**: Add comments to specific itinerary items

---

## Appendix: File Cross-Reference

| Component | File | Lines | Purpose |
|---|---|---|---|
| State object | itinerary.js | 6-24 | Central state store |
| Main render | itinerary.js | 156-290 | Orchestrates panel layout |
| Days rendering | itinerary.js | 498-543 | Collapsible cards + toggle |
| Timeline | itinerary.js | 548-597 | Activity grid + connectors |
| Budget | itinerary.js | 602-647 | Category breakdown |
| CSS theme | style.css | 8-40 | Color + animation vars |
| CSS panels | style.css | 81-128 | Panel structure |
| CSS daily | style.css | 379-455 | Day cards + timeline |
| TripBook | trip-book.js | 23-524 | Data model + serialization |
| toPanelData | trip-book.js | 430-494 | Main transformation |
| Updates | trip-book.js | 140-239 | State mutations |
| SSE handling | chat.js | 314-326 | Event reception |
| UI restore | chat.js | 708-738 | Snapshot loading |

---

## Summary for Redesign

**Critical to Preserve:**
- Phase progression indicators
- Weather multi-city support
- Daily plan structure with segments
- Timeline visualization
- Budget summary breakdown
- Translation layers (EN→ZH)

**Safe to Refactor:**
- CSS classes (full redesign possible)
- Render order (can reorganize)
- Collapse state management (use localStorage)
- Grid layout (flexibility)

**Must Rethink:**
- Entity relationships (add IDs, references)
- Editing model (two-way vs. one-way)
- Accumulation strategy (flights/hotels)
- Data flow (maybe use reactive state like Vue/React)

