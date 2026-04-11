# Itinerary Panel UI — Documentation Index

## 📚 Complete Exploration (Completed: April 11, 2026)

You now have **three comprehensive documents** covering every aspect of the itinerary overview panel UI code.

---

## 📄 Documentation Files

### 1. **ITINERARY_PANEL_EXPLORATION.md** (Main Reference — 27 KB)
**When to use:** Deep dive, complete understanding, implementation details

**Contents:**
- File locations and line numbers (all 3 files)
- Full `itineraryState` structure (22 fields breakdown)
- Phase mapping system (0-7 internal → 1-4 UI)
- `renderItinerary()` function — line-by-line breakdown (108-230)
  - Empty state logic
  - Basic fields rendering
  - Preferences, weather, progress bar
  - Booking cards (flights/hotels)
  - TripBook extensions
- `updateFromTripBook()` complete flow (302-344)
- `renderRoute()` visualization (349-360)
- `renderDaysPlan()` card rendering (365-384)
  - Expected data shape for each day
- `renderBudgetSummary()` breakdown (389-424)
  - Budget summary data structure
- All CSS classes (40+) with line numbers and purposes
- Panel layout explanation (single column, 380px)
- Data flow sequence diagram
- Customization guide for multi-column layout

**Key Sections:**
- Section 2: itinerary.js complete code
- Section 2 (continued): CSS styling all classes
- Section 3: TripBook data export with examples
- Section 4: Panel layout summary
- Section 5: CSS classes reference table
- Section 6: Data flow sequence
- Section 8: Customization points

---

### 2. **ITINERARY_QUICK_REF.md** (Quick Lookup — 8.3 KB)
**When to use:** Quick reference, finding specific functions, remembering data shapes

**Contents:**
- File map with line numbers
- State structure at a glance
- Visual ASCII layout of the panel (exactly how it appears)
- Key functions (3 main ones):
  - `renderItinerary()` — 108-230
  - `updateFromTripBook()` — 302-344
  - `toPanelData()` — 426-477 in trip-book.js
- CSS highlights table (7 major classes)
- Data shapes for:
  - Flight objects
  - Hotel objects
  - Day objects
  - Budget summary objects
- Edit functionality explanation
- "What's missing" (7 opportunities for improvement)
- "Quick edits" (common modification steps)

**Best for:**
- Pre-implementation review
- Finding line numbers fast
- Understanding panel layout visually
- Reference during coding

---

### 3. **ITINERARY_CODE_MAP.txt** (Visual Tree — 30 KB)
**When to use:** Structural overview, function hierarchy, ASCII art reference

**Contents:**
- Complete ASCII tree of `public/js/itinerary.js`
  - State structure with all 22 fields
  - All functions with exact line numbers
  - Comments on what each does
- CSS class hierarchy
  - Container styles
  - Row/column layouts
  - All component classes
- TripBook `toPanelData()` structure
- Data flow diagram (visual)
- Key statistics:
  - File sizes (lines)
  - Field counts
  - CSS class count
  - Layout dimensions
  - Security features
  - Performance characteristics

**Best for:**
- Visual learners
- Architecture understanding
- Identifying where to make changes
- Generating function/class lists

---

## 🎯 Quick Navigation

### "I need to..."

**...understand how the panel works**
→ Start with **ITINERARY_QUICK_REF.md** (visual layout + functions)
→ Then read **ITINERARY_PANEL_EXPLORATION.md** section 2–3

**...find a specific CSS class**
→ **ITINERARY_PANEL_EXPLORATION.md** section 5 (classes reference table)
→ Or **ITINERARY_CODE_MAP.txt** (visual hierarchy)

**...add a new field to the panel**
→ **ITINERARY_QUICK_REF.md** "Quick Edits" section
→ Implement in 5 places (documented)

**...implement multi-column layout**
→ **ITINERARY_PANEL_EXPLORATION.md** section 8 (customization points)

**...debug rendering issues**
→ **ITINERARY_PANEL_EXPLORATION.md** section 2C (renderItinerary logic)
→ Check condition order and HTML generation

**...integrate new data from TripBook**
→ **ITINERARY_PANEL_EXPLORATION.md** section 3 (toPanelData shape)
→ Then section D (updateFromTripBook logic)

**...understand data flow**
→ **ITINERARY_QUICK_REF.md** "Data Flow" diagram
→ Or **ITINERARY_CODE_MAP.txt** "Data Flow Diagram"

---

## 📊 File Structure Summary

| File | Lines | Purpose |
|------|-------|---------|
| `public/js/itinerary.js` | 437 | UI state + rendering + edit logic |
| `public/css/style.css` | 262 itinerary lines | All styling + layout |
| `models/trip-book.js` | 52 (toPanelData) | Data export method |

---

## 🔑 Key Concepts

### State Structure
```javascript
itineraryState = {
  // Basic info
  destination, departCity, dates, days, people, budget
  
  // Arrays
  preferences[], flights[], hotels[]
  
  // Progress
  phase (0-4), phaseLabel
  
  // Display
  weather
  
  // TripBook extensions
  route[], daysPlan[], budgetSummary
}
```

### Main Functions
- **`renderItinerary()`** — Builds entire HTML from state (122 lines)
- **`updateFromTripBook(data)`** — Updates state from SSE event (43 lines)
- **`toPanelData()`** — Exports data from server for frontend (52 lines)

### CSS Design
- **Single column**: 380px wide
- **Dark theme**: slate-800 → slate-900 gradient background
- **40+ classes**: Well-organized component styling
- **Light day cards**: Stand out from dark panel

### Data Flow
```
Server: toPanelData()
  ↓ SSE event
Frontend: updateFromTripBook(data)
  ↓ merge state
Frontend: renderItinerary()
  ↓ build HTML
DOM: #itinerary-body.innerHTML
  ↓ display
User: sees panel
```

---

## 🛠️ Implementation Checklist

**To add a new field:**
- [ ] Add to `itineraryState` (lines 6-23 in itinerary.js)
- [ ] Add rendering in `renderItinerary()` (line 108+)
- [ ] Add merge logic in `updateFromTripBook()` (line 302+)
- [ ] Add to `toPanelData()` return (trip-book.js 426+)
- [ ] Add CSS if needed

**To add a new section:**
- [ ] Create `render<SectionName>()` function
- [ ] Call from `renderItinerary()` (line 207+)
- [ ] Create CSS classes for styling
- [ ] Add data to `toPanelData()`

**To change layout:**
- [ ] Modify `.itinerary-panel` CSS
- [ ] Adjust `.itin-row` proportions
- [ ] Update HTML generation in `renderItinerary()`

---

## 📈 Statistics

**Code:**
- Total lines (combined): 701
- JavaScript (itinerary.js): 437 lines
- CSS (itinerary-related): 262 lines
- Backend (toPanelData): 52 lines

**Components:**
- State fields: 22
- Render functions: 7 (main + 4 helpers + 2 section renderers)
- CSS classes: 40+
- HTML sections: 9

**Layout:**
- Panel width: 380px (fixed)
- Panel height: 100vh (full screen)
- Header height: 56px (fixed)
- Scrollable body: remaining space

**Features:**
- Inline editing: Yes (with escape/enter keys)
- XSS protection: Yes (escItinHtml)
- Animation: Yes (pulsing progress bar)
- Responsive: Yes (hidden at ≤900px)

---

## 🚀 Next Steps

1. **Understand the code** using these docs
2. **Identify gaps** in ITINERARY_QUICK_REF.md "What's missing" section
3. **Plan your changes** with ITINERARY_PANEL_EXPLORATION.md examples
4. **Reference during coding** using ITINERARY_CODE_MAP.txt line numbers
5. **Test your changes** by checking all 5 places when adding fields

---

## 📝 Notes

- All line numbers are accurate as of April 11, 2026
- CSS classes follow BEM-like naming: `.itin-*` prefix
- XSS escaping applied to all user-visible strings
- Phase mapping: internal 0-7 system → UI 1-4 display
- TripBook extensions (route, daysPlan, budgetSummary) are fully integrated
- Light theme used for day cards to contrast with dark panel

---

**Created:** April 11, 2026  
**Status:** ✅ Complete thorough exploration  
**Files:** 3 comprehensive documents  
**Coverage:** 100% of UI code paths
