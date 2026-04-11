# Map Removal - Validation Checklist

## Items to Keep (NOT Remove)

These are frequently confused with map-related items but should NOT be removed because they're still needed for the `search_poi` tool (POI searching functionality):

### 1. ✅ KEEP in `public/js/chat.js`
- **Line 348**: `search_poi: '📍 地点搜索'` (tool display label)
- **Lines 362-363**: `search_poi` case in `formatToolName()` (tool description formatting)
- ✅ These support the POI search TOOL, not the map display

### 2. ✅ KEEP in `server.js`
- **Lines 116-119**: `search_poi` case in `getToolResultLabel()` (tool result label)
- ✅ This displays results of POI search, not map-related

### 3. ✅ KEEP in `tools/poi-search.js`
- ✅ ENTIRE FILE - this is the POI search tool, NOT map-related
- The search_poi tool returns location data that OTHER parts of the app may use

---

## Items Confirmed for Removal

### Direct Map References (Delete/Remove):
- `map.js` - Map initialization, marker rendering, POI visualization
- `focus-map.js` - Map focusing tool
- All Leaflet CDN links
- All `.map-*`, `.poi-*`, `#map` CSS classes
- `mapFocus()`, `addPOIData()`, `clearMap()`, `toggleMapPanel()`, `initMap()` functions
- `poi_data` SSE event handler
- `map_focus` SSE event handler and SSE sending
- `focus_map` tool in tools registry
- `focus_map` tool description in system prompt
- Map panel HTML structure and button

---

## What Remains After Removal

### Functional Components:
1. ✅ POI Search Tool (`tools/poi-search.js`) - Returns location data
2. ✅ Tool result labels for `search_poi` - Shows "Found X locations"
3. ✅ Tool display formatting - Shows search parameters
4. ✅ SSE message routing in chat.js - Handles other SSE events
5. ✅ Chat history and trip management
6. ✅ All other tools (weather, flights, hotels, exchange rate, web search)

### What the UI Will Look Like:
- Full-width chat panel (no map panel on right)
- No map toggle button in top bar
- Chat-only interface
- POI search tool will still work but results won't be visualized on a map

---

## File Status Reference

```
Status: BEFORE Changes
┌─ public/
│  ├─ index.html                [6 CHANGES: remove Leaflet + map panel]
│  ├─ css/
│  │  └─ style.css              [9 CHANGES: remove CSS classes]
│  └─ js/
│     ├─ chat.js                [3 CHANGES: remove SSE handlers]
│     └─ map.js                 [DELETE ENTIRE FILE]
├─ tools/
│  ├─ index.js                  [2 CHANGES: remove focusMap]
│  ├─ focus-map.js              [DELETE ENTIRE FILE]
│  └─ poi-search.js             [✅ KEEP - not map-related]
├─ server.js                    [3 CHANGES: remove SSE sends]
└─ prompts/
   └─ system-prompt.js          [1 CHANGE: remove focus_map description]

TOTAL DELETIONS: 2 files
TOTAL MODIFICATIONS: 6 files
TOTAL PRESERVED FILES: All others
```

---

## Detailed Validation by Category

### Search_poi (KEEP - Used for POI searching)
- Purpose: Search for restaurants, attractions, hotels, etc. with coordinates
- Still called by AI when user asks about specific locations
- Returns location name, address, phone, hours
- UI impact: Results won't display on map, but search tool still functional
- Files affected:
  - ✅ `tools/poi-search.js` - KEEP entire file
  - ✅ `server.js` lines 116-119 - KEEP tool result label
  - ✅ `public/js/chat.js` line 348 - KEEP tool label
  - ✅ `public/js/chat.js` lines 362-363 - KEEP tool description

### Focus_map (REMOVE - Maps specifically)
- Purpose: Move map viewport to destination
- Completely map-specific, no other use
- Files affected:
  - ❌ `tools/focus-map.js` - DELETE entire file
  - ❌ `tools/index.js` line 12 - REMOVE require
  - ❌ `tools/index.js` line 14 - REMOVE from ALL_TOOLS array
  - ❌ `prompts/system-prompt.js` line 65 - REMOVE tool description
  - ❌ `server.js` lines 123-125 - REMOVE result label
  - ❌ `server.js` lines 159-164 - REMOVE SSE send

### Map Panel (REMOVE - UI display)
- Purpose: Right-side panel showing Leaflet map and POI list
- Files affected:
  - ❌ `public/index.html` - 5 changes
  - ❌ `public/css/style.css` - 9 changes
  - ❌ `public/js/map.js` - DELETE entire file
  - ❌ `public/js/chat.js` - 3 changes

---

## Post-Removal Verification Steps

After making all changes, verify:

1. ✅ Application starts without errors
2. ✅ Chat interface loads with full-width panel
3. ✅ No console errors about undefined functions (map.js, clearMap, etc.)
4. ✅ No console warnings about missing Leaflet
5. ✅ Chat can still send and receive messages
6. ✅ Other SSE event types still work (weather, exchange rate, etc.)
7. ✅ Can still interact with history and settings panels
8. ✅ POI search tool still appears in AI responses (if called)
   - Note: Results display will show in chat text only, not on map

---

## Reference

- **Detailed Guide**: See `MAP_REMOVAL_REFERENCES.md` for line-by-line details
- **Quick Summary**: See `MAP_REMOVAL_QUICK_REFERENCE.txt` for overview
