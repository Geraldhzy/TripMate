# Map-Related Functionality Removal Reference Guide

## Complete Inventory of Map References

This document provides exact file paths, line numbers, and code snippets for all map-related functionality that needs to be removed from the project.

---

## 1. HTML Structure - `public/index.html`

### 1.1 Leaflet CDN References
- **Line 8**: Leaflet CSS link
  ```html
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  ```

- **Line 141**: Leaflet JS script
  ```html
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  ```

### 1.2 Map Panel Button
- **Line 84**: Map toggle button in top bar
  ```html
  <button onclick="toggleMapPanel()" class="btn-icon" title="收起地图" id="map-toggle-btn">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
  </button>
  ```

### 1.3 Map Panel HTML Block
- **Lines 124-137**: Entire map panel div and contents
  ```html
  <!-- 右侧：地图面板 -->
  <div class="map-panel" id="map-panel">
    <div class="map-header">
      <span class="map-title">🗺️ 行程地图</span>
      <span class="poi-count" id="poi-count"></span>
      <div style="flex:1"></div>
      <button class="map-clear-btn" id="clear-map-btn" onclick="clearMap()">清空地图</button>
    </div>
    <div id="map"></div>
    <div class="poi-list-header">📍 地点收藏</div>
    <div class="poi-list" id="poi-list">
      <div class="poi-empty">规划行程后，地点将显示在这里</div>
    </div>
  </div>
  ```

### 1.4 Map JS Script Reference
- **Line 142**: Map JS file inclusion
  ```html
  <script src="js/map.js"></script>
  ```

---

## 2. CSS Styles - `public/css/style.css`

### 2.1 Map Panel Container Styles
- **Lines 63-71**: Main map panel flex container
  ```css
  .map-panel {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%);
  }
  ```

### 2.2 Map Header Styles
- **Lines 73-90**: Map header and title styling
  ```css
  .map-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    height: 56px;
    flex-shrink: 0;
    background: linear-gradient(90deg, #0f172a, #1e3a5f);
    border-bottom: 1px solid rgba(255,255,255,.08);
  }

  .map-title {
    font-size: 15px;
    font-weight: 700;
    color: #e2e8f0;
    white-space: nowrap;
  }
  ```

### 2.3 POI Count Badge
- **Lines 91-97**: POI counter badge styling
  ```css
  .poi-count {
    font-size: 12px;
    color: #64748b;
    background: rgba(255,255,255,.07);
    padding: 2px 10px;
    border-radius: 20px;
  }
  ```

### 2.4 Map Action Buttons
- **Lines 99-107**: Clear button and action button styles
  ```css
  .map-action-btn {
    background: rgba(255,255,255,.08) !important;
    border-color: rgba(255,255,255,.12) !important;
    width: 30px !important;
    height: 30px !important;
  }
  .map-action-btn:hover {
    background: rgba(255,255,255,.18) !important;
  }

  .map-clear-btn {
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 500;
    color: #94a3b8;
    background: rgba(255,255,255,.07);
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 8px;
    cursor: pointer;
    transition: color .18s, background .18s, border-color .18s;
    white-space: nowrap;
  }
  .map-clear-btn:hover {
    color: #f87171;
    background: rgba(248,113,113,.12);
    border-color: rgba(248,113,113,.35);
  }
  ```

### 2.5 Leaflet Map Container
- **Lines 127-130**: Map div container styles
  ```css
  #map {
    flex: 1;
    min-height: 0;
  }
  ```

### 2.6 Leaflet Popup Styling
- **Lines 132-136**: Leaflet popup CSS overrides
  ```css
  /* Leaflet popup 深色适配 */
  .leaflet-popup-content-wrapper {
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,.3);
  }
  ```

### 2.7 POI List Container
- **Lines 138-169**: POI list header, list, and empty state
  ```css
  .poi-list-header {
    padding: 10px 14px 6px;
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: .5px;
    flex-shrink: 0;
    background: rgba(15,23,42,.6);
    border-top: 1px solid rgba(255,255,255,.06);
  }

  .poi-list {
    height: 230px;
    overflow-y: auto;
    padding: 6px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
    background: rgba(15,23,42,.4);
  }
  .poi-list::-webkit-scrollbar { width: 4px; }
  .poi-list::-webkit-scrollbar-track { background: transparent; }
  .poi-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 2px; }

  .poi-empty {
    text-align: center;
    color: #475569;
    font-size: 13px;
    padding: 24px 0;
  }
  ```

### 2.8 POI Card Styles
- **Lines 171-209**: All POI card and POI card element styles
  ```css
  .poi-card {
    background: rgba(255,255,255,.06);
    border: 1px solid rgba(255,255,255,.09);
    border-radius: 10px;
    padding: 9px 12px;
    cursor: pointer;
    transition: background .18s, border-color .18s, transform .15s;
    flex-shrink: 0;
  }
  .poi-card:hover {
    background: rgba(8,145,178,.2);
    border-color: rgba(8,145,178,.5);
    transform: translateX(2px);
  }
  .poi-card.active {
    background: rgba(8,145,178,.28);
    border-color: #0891b2;
  }
  .poi-card-name {
    font-weight: 600;
    font-size: 13px;
    color: #e2e8f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .poi-card-addr {
    font-size: 11.5px;
    color: #94a3b8;
    margin-top: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .poi-card-meta {
    font-size: 11px;
    color: #64748b;
    margin-top: 3px;
  }
  ```

### 2.9 Map Panel Collapse Animation
- **Lines 211-219**: Map panel transition and collapsed state
  ```css
  /* 桌面端：地图面板折叠动画 */
  .map-panel {
    transition: flex .3s ease;
  }
  .map-panel.collapsed {
    flex: 0 !important;
    min-width: 0 !important;
    overflow: hidden;
  }
  ```

---

## 3. JavaScript - `public/js/map.js`

**This is the entire map module file. All 251 lines should be removed.**

### Key Sections:

### 3.1 Map Initialization Function
- **Lines 13-24**: `initMap()` function
  ```javascript
  function initMap() {
    if (map) return;
    map = L.map('map', {
      zoomControl: true,
      attributionControl: true
    }).setView([20, 108], 4);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri',
      maxZoom: 19
    }).addTo(map);
  }
  ```

### 3.2 Map Focus Function (SSE Handler)
- **Lines 27-33**: `focusMap(data)` function for `map_focus` SSE events
  ```javascript
  function focusMap(data) {
    if (!map) initMap();
    if (!data.lat || !data.lon) return;
    map.flyTo([data.lat, data.lon], data.zoom || 10, { duration: 1.2 });
  }
  ```

### 3.3 Add POI Data Function (SSE Handler)
- **Lines 36-58**: `addPOIData(data)` function for `poi_data` SSE events
  ```javascript
  function addPOIData(data) {
    if (!map) initMap();
    const { results } = data;
    if (!results || results.length === 0) return;

    results.forEach(poi => {
      const isDuplicate = markerList.some(
        m => m.poi.lat === poi.lat && m.poi.lon === poi.lon
      );
      if (isDuplicate) return;

      const marker = addMarker(poi);
      const card   = addCard(poi);
      markerList.push({ marker, poi, card });
      poiCount++;
    });

    fitMapToPOIs();
    updatePoiCount();
  }
  ```

### 3.4 Marker Management
- **Lines 63-86**: `addMarker(poi)` function
- **Lines 88-98**: `buildPopupHtml(poi)` function

### 3.5 POI Card List Management
- **Lines 103-136**: `addCard(poi)` function

### 3.6 Interactive Functions
- **Lines 141-169**: `flyToMarker()`, `highlightCardByPoi()`, `setActiveCard()`, `fitMapToPOIs()`

### 3.7 Clear Map Function
- **Lines 174-182**: `clearMap()` function
  ```javascript
  function clearMap() {
    markerList.forEach(({ marker }) => map && map.removeLayer(marker));
    markerList = [];
    poiCount = 0;
    const list = document.getElementById('poi-list');
    if (list) list.innerHTML = '<div class="poi-empty">规划行程后，地点将显示在这里</div>';
    updatePoiCount();
    if (map) map.setView([20, 108], 4);
  }
  ```

### 3.8 Toggle Map Panel Function
- **Lines 196-216**: `toggleMapPanel()` function
  ```javascript
  function toggleMapPanel() {
    const panel = document.getElementById('map-panel');
    const btn   = document.getElementById('map-toggle-btn');
    if (!panel) return;

    panel.classList.toggle('collapsed');
    const isCollapsed = panel.classList.contains('collapsed');

    if (btn) {
      btn.title = isCollapsed ? '展开地图' : '收起地图';
      btn.innerHTML = isCollapsed
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`;
    }

    if (!isCollapsed && map) {
      setTimeout(() => map.invalidateSize(), 320);
    }
  }
  ```

### 3.9 Utility Functions
- **Lines 221-241**: Helper functions including `categoryIcon()` and `escapeMapHtml()`

### 3.10 DOMContentLoaded Initialization
- **Lines 246-250**: Initialization code
  ```javascript
  document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setTimeout(() => map && map.invalidateSize(), 100);
  });
  ```

---

## 4. Chat JS Handler - `public/js/chat.js`

### 4.1 SSE Event Handler for poi_data
- **Lines 294-297**: Handler for `poi_data` SSE events
  ```javascript
  case 'poi_data':
    // POI 数据推送给地图面板
    if (typeof addPOIData === 'function') addPOIData(data);
    break;
  ```

### 4.2 SSE Event Handler for map_focus
- **Lines 299-302**: Handler for `map_focus` SSE events
  ```javascript
  case 'map_focus':
    // 地图定位到目的地
    if (typeof focusMap === 'function') focusMap(data);
    break;
  ```

### 4.3 Tool Label for search_poi
- **Line 348**: Label for search_poi tool in tool name map
  ```javascript
  search_poi: '📍 地点搜索',
  ```

### 4.4 Tool Description for search_poi
- **Lines 362-363**: Tool description case in `formatToolName()` function
  ```javascript
  case 'search_poi':
    return `📍 搜索地点「${args.keyword || args.query || ''}」${args.city ? ' · ' + args.city : ''}`;
  ```

### 4.5 Clear Map on Chat Reset
- **Line 615**: Call to `clearMap()` in `clearChat()` function
  ```javascript
  if (typeof clearMap === 'function') clearMap();
  ```

---

## 5. Server-Side SSE Event Sending - `server.js`

### 5.1 search_poi Tool Result Label
- **Lines 116-119**: getToolResultLabel case for search_poi
  ```javascript
  case 'search_poi': {
    const count = Array.isArray(data.results) ? data.results.length : (Array.isArray(data) ? data.length : 0);
    return `找到 ${count} 个地点`;
  }
  ```

### 5.2 focus_map Tool Result Label
- **Lines 123-125**: getToolResultLabel case for focus_map
  ```javascript
  case 'focus_map': {
    return data.destination ? `定位到「${data.destination}」` : null;
  }
  ```

### 5.3 search_poi SSE Event Sending
- **Lines 152-157**: Send `poi_data` SSE event after search_poi execution
  ```javascript
  if (funcName === 'search_poi') {
    try {
      const parsed = JSON.parse(resultStr);
      if (parsed.results && parsed.results.length > 0) sendSSE('poi_data', parsed);
    } catch {}
  }
  ```

### 5.4 focus_map SSE Event Sending
- **Lines 159-164**: Send `map_focus` SSE event after focus_map execution
  ```javascript
  if (funcName === 'focus_map') {
    try {
      const parsed = JSON.parse(resultStr);
      if (parsed.lat && parsed.lon) sendSSE('map_focus', parsed);
    } catch {}
  }
  ```

---

## 6. Tools Registration - `tools/index.js`

### 6.1 focusMap Import
- **Line 12**: Import of focus-map tool
  ```javascript
  const focusMap = require('./focus-map');
  ```

### 6.2 focusMap in ALL_TOOLS Array
- **Line 14**: focusMap included in tool registration array
  ```javascript
  const ALL_TOOLS = [webSearch, weather, exchangeRate, poiSearch, flightSearch, hotelSearch, destKnowledge, focusMap];
  ```

---

## 7. Focus Map Tool File - `tools/focus-map.js`

**This entire file (80 lines) should be deleted.**

### 7.1 Tool Definition
- **Lines 26-46**: TOOL_DEF object definition with name 'focus_map'
  ```javascript
  const TOOL_DEF = {
    name: 'focus_map',
    description: `将地图视野定位到指定目的地...`,
    parameters: { ... }
  };
  ```

### 7.2 Tool Execution Function
- **Lines 48-77**: `execute()` async function

---

## 8. System Prompt - `prompts/system-prompt.js`

### 8.1 Tool Description in System Prompt
- **Line 61**: Reference to search_poi in tool list
  ```javascript
  - search_poi: 搜索餐厅、景点、酒店等地点信息和坐标。
  ```

### 8.2 focus_map Tool Description
- **Line 65**: Reference to focus_map in tool list and calling instructions
  ```javascript
  - focus_map: **用户提到目的地时立即调用**，将前端地图定位到该目的地区域。应在第一轮工具调用中与其他工具并行执行，无需等待其他工具完成。
  ```

---

## Summary Table

| Category | File | Line(s) | Component | Action |
|----------|------|---------|-----------|--------|
| HTML | public/index.html | 8 | Leaflet CSS CDN | Remove |
| HTML | public/index.html | 84 | Map toggle button | Remove |
| HTML | public/index.html | 124-137 | Map panel HTML | Remove |
| HTML | public/index.html | 141 | Leaflet JS CDN | Remove |
| HTML | public/index.html | 142 | map.js script | Remove |
| CSS | public/css/style.css | 64-71 | .map-panel styles | Remove |
| CSS | public/css/style.css | 73-90 | .map-header, .map-title | Remove |
| CSS | public/css/style.css | 91-97 | .poi-count | Remove |
| CSS | public/css/style.css | 99-125 | Map action buttons | Remove |
| CSS | public/css/style.css | 127-130 | #map container | Remove |
| CSS | public/css/style.css | 132-136 | Leaflet popup styles | Remove |
| CSS | public/css/style.css | 138-169 | POI list/cards | Remove |
| CSS | public/css/style.css | 211-219 | Map collapse animation | Remove |
| JS | public/js/map.js | 1-251 | Entire file | Delete |
| JS | public/js/chat.js | 294-297 | poi_data SSE handler | Remove |
| JS | public/js/chat.js | 299-302 | map_focus SSE handler | Remove |
| JS | public/js/chat.js | 348 | search_poi label | Keep (not map-related) |
| JS | public/js/chat.js | 362-363 | search_poi description | Keep (not map-related) |
| JS | public/js/chat.js | 615 | clearMap() call | Remove |
| Server | server.js | 116-119 | search_poi label | Keep (not map-related) |
| Server | server.js | 123-125 | focus_map label | Remove |
| Server | server.js | 152-157 | poi_data SSE send | Remove |
| Server | server.js | 159-164 | map_focus SSE send | Remove |
| Tools | tools/index.js | 12 | focusMap require | Remove |
| Tools | tools/index.js | 14 | focusMap in array | Remove |
| Tools | tools/focus-map.js | 1-80 | Entire file | Delete |
| Prompt | prompts/system-prompt.js | 61 | search_poi description | Keep (not map-related) |
| Prompt | prompts/system-prompt.js | 65 | focus_map description | Remove |

---

## Files to Delete

1. `/Users/geraldhuang/DEV/ai-travel-planner/public/js/map.js`
2. `/Users/geraldhuang/DEV/ai-travel-planner/tools/focus-map.js`

## Files to Modify

1. `/Users/geraldhuang/DEV/ai-travel-planner/public/index.html`
2. `/Users/geraldhuang/DEV/ai-travel-planner/public/css/style.css`
3. `/Users/geraldhuang/DEV/ai-travel-planner/public/js/chat.js`
4. `/Users/geraldhuang/DEV/ai-travel-planner/server.js`
5. `/Users/geraldhuang/DEV/ai-travel-planner/tools/index.js`
6. `/Users/geraldhuang/DEV/ai-travel-planner/prompts/system-prompt.js`
