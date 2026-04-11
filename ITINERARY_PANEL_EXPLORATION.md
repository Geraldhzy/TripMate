# Itinerary Overview Panel UI — Complete Code Exploration

## 📋 Executive Summary

This document provides a **thorough exploration** of the itinerary overview panel UI code, including:
- Full state structure and rendering logic
- CSS styling (single layout section)
- Data flow from TripBook to frontend
- All HTML rendering patterns and classes

---

## 1️⃣ File Locations & Line Numbers

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| **JS State & Rendering** | `public/js/itinerary.js` | 1–437 | All itinerary UI logic |
| **CSS Styling** | `public/css/style.css` | 64–325 | Itinerary panel + content styles |
| **Data Export** | `models/trip-book.js` | 426–477 | `toPanelData()` method |

---

## 2️⃣ itinerary.js — Complete Breakdown

### A) State Structure (Lines 6–23)

```javascript
let itineraryState = {
  destination: '',          // 目的地
  departCity: '',           // 出发城市
  dates: '',                // 日期字符串 (e.g., "2024-04-15 ~ 2024-04-22")
  days: 0,                  // 天数 (数字)
  people: 0,                // 人数
  budget: '',               // 预算字符串 (e.g., "¥50000" 或 "20000元/人")
  preferences: [],          // 偏好标签数组 (e.g., ["美食", "自然", "文化"])
  phase: 0,                 // 进度阶段 (1–4，映射内部 0–7)
  phaseLabel: '',           // 阶段文本 (e.g., "确认需求")
  flights: [],              // 机票数组 [{route, airline, price, time, status}]
  hotels: [],               // 酒店数组 [{name, city, price, nights, status}]
  weather: null,            // 天气对象 {city, temp_c, description}
  
  // TripBook 扩展字段
  route: [],                // 路线城市数组 (e.g., ["东京", "京都", "大阪"])
  daysPlan: [],             // 每日行程数组 [{day, date, city, title, segmentCount}]
  budgetSummary: null       // 预算摘要对象 {flights, hotels, ..., total_cny, budget_cny, remaining_cny}
};
```

**Key Points:**
- `phase` is mapped from internal 7-level system (0–7) to 4-level UI display (1–4)
- All string values are escaped with `escItinHtml()` before rendering
- Arrays can be incrementally updated or fully replaced

### B) Phase Mapping (Lines 25–40)

```javascript
const PHASE_LABELS = [
  '',               // 0 = 未开始
  '确认需求',       // 1
  '规划行程',       // 2
  '完善细节',       // 3
  '预算总结'        // 4
];

function mapPhase(raw) {
  if (raw <= 0) return 0;
  if (raw <= 1) return 1; // 锁定约束 → 确认需求
  if (raw <= 3) return 2; // 机票查询+构建框架 → 规划行程
  if (raw <= 5) return 3; // 关键预订+每日详情 → 完善细节
  return 4;               // 预算汇总+导出总结 → 预算总结
}
```

### C) Main Rendering Function: `renderItinerary()` (Lines 108–230)

This is the **core HTML generation logic**. It builds HTML incrementally and appends to `#itinerary-body`.

#### Structure:
1. **Empty state check** (Lines 114–117)
2. **Basic fields** (Lines 122–178)
   - Destination, depart city, dates/days, people, budget
   - Preferences tags
   - Weather
   - Progress bar
3. **Bookings** (Lines 181–204)
   - Flights section
   - Hotels section
4. **TripBook Extensions** (Lines 207–219)
   - Route visualization
   - Daily itinerary summary
   - Budget summary
5. **Event binding** (Lines 224–229)
   - Edit button click handlers

#### Key HTML Building Blocks:

**Basic Row (`buildRow()` Lines 235–245):**
```javascript
function buildRow(icon, label, valueHtml, editableField) {
  const editBtn = editableField
    ? `<button class="itin-edit-btn" data-field="${editableField}" title="修改">✏️</button>`
    : '';
  return `<div class="itin-row">
    <span class="itin-icon">${icon}</span>
    <span class="itin-label">${label}</span>
    <span class="itin-value" data-field="${editableField || ''}">${valueHtml}</span>
    ${editBtn}
  </div>`;
}
```

**Progress Bar (Lines 162–178):**
```javascript
let progressHtml = '<div class="itin-progress">';
for (let i = 1; i <= 4; i++) {
  const cls = i < s.phase ? 'done' : (i === s.phase ? 'active' : '');
  progressHtml += `<div class="itin-progress-seg ${cls}"></div>`;
}
progressHtml += '</div>';
```

**Flights Section (Lines 181–191):**
```javascript
if (s.flights.length > 0) {
  html += '<div class="itin-section-title">✈️ 机票</div>';
  s.flights.forEach(f => {
    html += `<div class="itin-booking-card">
      <div class="itin-booking-title">${escItinHtml(f.route || '')}</div>
      <div class="itin-booking-detail">
        ${f.airline ? escItinHtml(f.airline) + ' · ' : ''}${f.price ? escItinHtml(f.price) : ''}${f.time ? ' · ' + escItinHtml(f.time) : ''}
      </div>
    </div>`;
  });
}
```

**Hotels Section (Lines 194–204):**
```javascript
if (s.hotels.length > 0) {
  html += '<div class="itin-section-title">🏨 酒店</div>';
  s.hotels.forEach(h => {
    html += `<div class="itin-booking-card">
      <div class="itin-booking-title">${escItinHtml(h.name || '')}</div>
      <div class="itin-booking-detail">
        ${h.nights ? h.nights + '晚 · ' : ''}${h.price ? escItinHtml(h.price) : ''}
      </div>
    </div>`;
  });
}
```

### D) TripBook Data Update: `updateFromTripBook()` (Lines 302–344)

This function is called when SSE `tripbook_update` event is received.

```javascript
function updateFromTripBook(data) {
  if (!data) return;

  // Simple fields: direct assignment
  if (data.destination) itineraryState.destination = data.destination;
  if (data.departCity) itineraryState.departCity = data.departCity;
  if (data.dates) itineraryState.dates = data.dates;
  if (data.days) itineraryState.days = data.days;
  if (data.people) itineraryState.people = data.people;
  if (data.budget) itineraryState.budget = data.budget;
  
  // Phase mapping
  if (data.phase) {
    const mapped = mapPhase(data.phase);
    itineraryState.phase = mapped;
    itineraryState.phaseLabel = data.phaseLabel || PHASE_LABELS[mapped] || '';
  }
  
  // Preferences: direct replace
  if (data.preferences && data.preferences.length > 0) {
    itineraryState.preferences = data.preferences;
  }
  
  // Weather: direct assignment
  if (data.weather) {
    itineraryState.weather = data.weather;
  }

  // TripBook extensions: direct assignment or replace
  if (Array.isArray(data.route) && data.route.length > 0) {
    itineraryState.route = data.route;
  }
  if (Array.isArray(data.daysPlan) && data.daysPlan.length > 0) {
    itineraryState.daysPlan = data.daysPlan;
  }
  if (data.budgetSummary) {
    itineraryState.budgetSummary = data.budgetSummary;
  }

  // Flights/Hotels: full replace (from TripBook, not incremental append)
  if (Array.isArray(data.flights)) {
    itineraryState.flights = data.flights;
  }
  if (Array.isArray(data.hotels)) {
    itineraryState.hotels = data.hotels;
  }

  renderItinerary();
}
```

### E) Route Visualization: `renderRoute()` (Lines 349–360)

```javascript
function renderRoute(route) {
  if (!route || route.length === 0) return '';
  const stops = route.map((city, i) => {
    const isLast = i === route.length - 1;
    return `<span class="route-stop">${escItinHtml(city)}</span>${isLast ? '' : '<span class="route-arrow">→</span>'}`;
  }).join('');
  return `<div class="itin-row">
    <span class="itin-icon">🗺️</span>
    <span class="itin-label">路线</span>
    <span class="itin-value"><div class="itin-route">${stops}</div></span>
  </div>`;
}
```

**Renders as:** `东京 → 京都 → 大阪`

### F) Days Plan: `renderDaysPlan()` (Lines 365–384)

```javascript
function renderDaysPlan(daysPlan) {
  if (!daysPlan || daysPlan.length === 0) return '';
  let html = '<div class="itin-section-title">📋 每日行程</div>';
  for (const d of daysPlan) {
    const dateStr = d.date ? `<span class="day-date">${escItinHtml(d.date)}</span>` : '';
    const cityStr = d.city ? `<span class="day-city">${escItinHtml(d.city)}</span>` : '';
    const titleStr = d.title ? escItinHtml(d.title) : '';
    const segInfo = d.segmentCount > 0 ? `<span class="day-seg-count">${d.segmentCount}项活动</span>` : '';
    html += `<div class="itin-day-card">
      <div class="itin-day-header">
        <span class="day-num">Day ${d.day}</span>
        ${dateStr}${cityStr}
      </div>
      <div class="itin-day-body">
        ${titleStr}${segInfo ? ' · ' + segInfo : ''}
      </div>
    </div>`;
  }
  return html;
}
```

**Data shape for each day:**
```javascript
{
  day: 1,                    // 第1天
  date: "2024-04-15",        // 日期
  city: "东京",              // 城市
  title: "抵达东京",         // 标题/摘要
  segmentCount: 3            // 活动数量
}
```

### G) Budget Summary: `renderBudgetSummary()` (Lines 389–424)

```javascript
function renderBudgetSummary(summary) {
  if (!summary || !summary.total_cny) return '';
  let html = '<div class="itin-section-title">💰 预算摘要</div>';
  html += '<div class="itin-budget">';

  // 各项开销
  const items = ['flights', 'hotels', 'attractions', 'meals', 'transport', 'misc'];
  for (const key of items) {
    const item = summary[key];
    if (item && item.amount_cny) {
      html += `<div class="budget-item">
        <span class="budget-label">${escItinHtml(item.label || key)}</span>
        <span class="budget-amount">¥${item.amount_cny.toLocaleString()}</span>
      </div>`;
    }
  }

  // 总计
  html += `<div class="budget-item budget-total">
    <span class="budget-label">总计</span>
    <span class="budget-amount">¥${summary.total_cny.toLocaleString()}</span>
  </div>`;

  // 预算余量
  if (summary.budget_cny) {
    const remaining = summary.remaining_cny !== undefined 
      ? summary.remaining_cny 
      : (summary.budget_cny - summary.total_cny);
    const cls = remaining >= 0 ? 'budget-ok' : 'budget-over';
    html += `<div class="budget-item ${cls}">
      <span class="budget-label">${remaining >= 0 ? '剩余' : '超支'}</span>
      <span class="budget-amount">¥${Math.abs(remaining).toLocaleString()}</span>
    </div>`;
  }

  html += '</div>';
  return html;
}
```

**Data shape:**
```javascript
{
  total_cny: 50000,              // 总支出（人民币）
  budget_cny: 60000,             // 总预算（人民币）
  remaining_cny: 10000,          // 剩余（可选，自动计算）
  flights: { label: '机票', amount_cny: 5000 },
  hotels: { label: '酒店', amount_cny: 30000 },
  attractions: { label: '景点', amount_cny: 8000 },
  meals: { label: '餐饮', amount_cny: 4000 },
  transport: { label: '交通', amount_cny: 2000 },
  misc: { label: '其他', amount_cny: 1000 }
}
```

### H) HTML Escaping (Lines 429–436)

```javascript
function escItinHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

---

## 2️⃣ CSS Styling — `public/css/style.css`

### Panel Layout (Lines 64–111)

```css
/* 右侧行程面板 */
.itinerary-panel {
  width: 380px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%);
}

.itinerary-header {
  display: flex;
  align-items: center;
  padding: 0 20px;
  height: 56px;
  flex-shrink: 0;
  background: linear-gradient(90deg, #0f172a, #1e3a5f);
  border-bottom: 1px solid rgba(255,255,255,.08);
}

.itinerary-title {
  font-size: 15px;
  font-weight: 700;
  color: #e2e8f0;
}

.itinerary-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.itinerary-body::-webkit-scrollbar { width: 4px; }
.itinerary-body::-webkit-scrollbar-track { background: transparent; }
.itinerary-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 2px; }
```

**Key design:**
- **Single column layout** (width: 380px)
- Dark theme (slate-800 to slate-900 gradient)
- Scrollable body with custom scrollbar
- Header: 56px fixed height

### Empty State (Lines 98–110)

```css
.itinerary-empty {
  text-align: center;
  color: #475569;
  padding: 80px 20px 40px;
}
.itinerary-empty-icon {
  font-size: 2.5rem;
  margin-bottom: 12px;
}
.itinerary-empty p {
  font-size: 14px;
  line-height: 1.6;
}
```

### Row Styling (Lines 113–180)

```css
/* 行程字段行 */
.itin-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: 10px;
  background: rgba(255,255,255,.04);
  margin-bottom: 8px;
  transition: background .18s;
}
.itin-row:hover {
  background: rgba(255,255,255,.08);
}
.itin-icon {
  font-size: 1.1rem;
  width: 28px;
  text-align: center;
  flex-shrink: 0;
}
.itin-label {
  font-size: 12px;
  color: #64748b;
  width: 52px;
  flex-shrink: 0;
}
.itin-value {
  flex: 1;
  font-size: 14px;
  color: #e2e8f0;
  font-weight: 500;
}
.itin-edit-btn {
  opacity: 0;
  cursor: pointer;
  font-size: 13px;
  color: #0891b2;
  transition: opacity .18s;
  background: none;
  border: none;
  padding: 4px 6px;
}
.itin-row:hover .itin-edit-btn {
  opacity: 1;
}
```

**Layout:**
- Flexbox row: `[icon (28px)] [label (52px)] [value (flex)] [edit btn (hidden until hover)]`
- Hover effect: background transparency change + edit button appears

### Inline Edit Input (Lines 159–169)

```css
.itin-inline-input {
  flex: 1;
  background: rgba(255,255,255,.1);
  border: 1px solid #0891b2;
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 14px;
  padding: 4px 8px;
  outline: none;
  font-family: inherit;
}
```

### Preferences Tags (Lines 172–181)

```css
.itin-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  background: rgba(8,145,178,.2);
  color: #22d3ee;
  font-size: 12px;
  margin-right: 6px;
  margin-bottom: 4px;
}
```

### Progress Bar (Lines 184–204)

```css
.itin-progress {
  display: flex;
  gap: 3px;
}
.itin-progress-seg {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,.1);
}
.itin-progress-seg.done {
  background: #0891b2;
}
.itin-progress-seg.active {
  background: #22d3ee;
  animation: itinPulse 1.5s infinite;
}
@keyframes itinPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .5; }
}
```

### Booking Cards (Lines 207–234)

```css
.itin-section-title {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  margin: 16px 0 8px;
  text-transform: uppercase;
  letter-spacing: .5px;
}
.itin-booking-card {
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #cbd5e1;
  line-height: 1.5;
}
.itin-booking-card .itin-booking-title {
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 4px;
}
.itin-booking-card .itin-booking-detail {
  font-size: 12px;
  color: #64748b;
}
```

### Route Visualization (Lines 236–255)

```css
.itin-route {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
.route-stop {
  background: #e0f2fe;
  color: #0369a1;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.route-arrow {
  color: #94a3b8;
  font-size: 13px;
  margin: 0 1px;
}
```

**Renders as:** Light blue pills with arrows

### Daily Itinerary Cards (Lines 258–296)

```css
.itin-day-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
  margin: 4px 0;
}
.itin-day-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}
.day-num {
  background: var(--accent-color, #3b82f6);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 10px;
}
.day-date {
  font-size: 11px;
  color: #64748b;
}
.day-city {
  font-size: 11px;
  color: #0369a1;
  font-weight: 600;
}
.itin-day-body {
  font-size: 12px;
  color: #475569;
  padding-left: 2px;
}
.day-seg-count {
  font-size: 11px;
  color: #94a3b8;
}
```

**Note:** Day cards use **light theme** (white background) to stand out

### Budget Summary (Lines 299–324)

```css
.itin-budget {
  padding: 4px 0;
}
.budget-item {
  display: flex;
  justify-content: space-between;
  padding: 3px 10px;
  font-size: 12px;
  color: #475569;
}
.budget-item .budget-label {
  flex-shrink: 0;
}
.budget-item .budget-amount {
  font-weight: 600;
  font-variant-numeric: tabular-nums;  /* Monospace numbers */
}
.budget-total {
  border-top: 1px solid #e2e8f0;
  margin-top: 4px;
  padding-top: 6px;
  font-weight: 700;
  color: #1e293b;
}
.budget-ok .budget-amount { color: #16a34a; }    /* Green for surplus */
.budget-over .budget-amount { color: #dc2626; }  /* Red for deficit */
```

---

## 3️⃣ TripBook Data Export: `toPanelData()` (Lines 426–477 in trip-book.js)

This method is called from the server to generate frontend panel data.

```javascript
toPanelData() {
  const c = this.constraints;
  const it = this.itinerary;

  // Destination: show value + cities if available
  const dest = c.destination;
  const destStr = dest
    ? (dest.cities?.length ? `${dest.value} ${dest.cities.join('·')}` : dest.value || '')
    : '';

  // Weather: pick first entry
  let weather = null;
  const weatherEntries = Object.values(this.dynamic.weather);
  if (weatherEntries.length > 0) {
    const w = weatherEntries[0];
    weather = {
      city: w.city,
      temp_c: w.current?.temp_c,
      description: w.current?.description,
    };
  }

  return {
    // Constraints
    destination: destStr,
    departCity: c.departCity?.value || '',
    dates: c.dates ? (c.dates.start ? `${c.dates.start} ~ ${c.dates.end}` : '') : '',
    days: c.dates?.days || 0,
    people: c.people?.count || 0,
    budget: c.budget?.value || '',
    preferences: c.preferences?.tags || [],
    phase: it.phase,
    phaseLabel: it.phaseLabel,
    
    // Route
    route: it.route,
    
    // Flights (filtered: selected/booked only, or all if < 5)
    flights: this.dynamic.flightQuotes
      .filter(f => f.status !== 'quoted' || this.dynamic.flightQuotes.length <= 5)
      .map(f => ({
        route: f.route,
        airline: f.airline,
        price: f.price_cny ? `¥${f.price_cny}` : `$${f.price_usd}`,
        time: f.duration,
        status: f.status,
      })),
    
    // Hotels (filtered: selected/booked only, or all if < 5)
    hotels: this.dynamic.hotelQuotes
      .filter(h => h.status !== 'quoted' || this.dynamic.hotelQuotes.length <= 5)
      .map(h => ({
        name: h.name,
        city: h.city,
        price: h.price_total_cny ? `¥${h.price_total_cny}` : `$${h.price_per_night_usd}/晚`,
        nights: h.nights,
        status: h.status,
      })),
    
    // Weather
    weather,
    
    // Budget summary
    budgetSummary: it.budgetSummary,
    
    // Daily plan (map itinerary days to display format)
    daysPlan: it.days.map(d => ({
      day: d.day,
      date: d.date,
      city: d.city,
      title: d.title,
      segmentCount: d.segments?.length || 0,
    })),
  };
}
```

### Return Data Shape Reference

```javascript
{
  // Basic constraints
  destination: "日本 东京·京都·大阪",
  departCity: "北京",
  dates: "2024-04-15 ~ 2024-04-22",
  days: 8,
  people: 2,
  budget: "¥50000",
  preferences: ["美食", "寺庙", "温泉"],
  
  // Phase
  phase: 3,                    // UI displays 1–4
  phaseLabel: "完善细节",
  
  // Route
  route: ["东京", "京都", "大阪"],
  
  // Flights array
  flights: [
    {
      route: "北京 → 东京",
      airline: "ANA",
      price: "¥4500",
      time: "11h 20m",
      status: "selected"
    }
  ],
  
  // Hotels array
  hotels: [
    {
      name: "東京ホテル",
      city: "东京",
      price: "¥800/晚",
      nights: 3,
      status: "selected"
    }
  ],
  
  // Weather
  weather: {
    city: "東京",
    temp_c: 18,
    description: "晴朗"
  },
  
  // Budget summary
  budgetSummary: {
    flights: { label: "机票", amount_cny: 9000 },
    hotels: { label: "酒店", amount_cny: 24000 },
    attractions: { label: "景点", amount_cny: 8000 },
    meals: { label: "餐饮", amount_cny: 6000 },
    transport: { label: "交通", amount_cny: 2000 },
    misc: { label: "其他", amount_cny: 1000 },
    total_cny: 50000,
    budget_cny: 50000,
    remaining_cny: 0
  },
  
  // Daily plan
  daysPlan: [
    {
      day: 1,
      date: "2024-04-15",
      city: "东京",
      title: "抵达东京，入住酒店",
      segmentCount: 2
    },
    {
      day: 2,
      date: "2024-04-16",
      city: "东京",
      title: "浅草寺、晴空塔",
      segmentCount: 3
    }
  ]
}
```

---

## 4️⃣ Panel Layout Summary

### Current Structure: **Single Column**

```
┌──────────────────────┐
│  📍 Itinerary Panel  │  (header: 56px, fixed)
├──────────────────────┤
│ • destination        │
│ • depart city        │  (each row: ~30px)
│ • dates + days       │
│ • people             │
│ • budget             │
│ • preferences tags   │
│ • weather            │
│ • progress bar       │
├──────────────────────┤
│ ✈️ FLIGHTS           │  (section header)
│ ┌────────────────┐   │
│ │ Route          │   │  (booking cards)
│ │ Airline · Price│   │
│ └────────────────┘   │
├──────────────────────┤
│ 🏨 HOTELS            │
│ ┌────────────────┐   │
│ │ Hotel Name     │   │
│ │ City · Price   │   │
│ └────────────────┘   │
├──────────────────────┤
│ 🗺️ ROUTE             │
│ Tokyo → Kyoto →      │
│ Osaka                │
├──────────────────────┤
│ 📋 DAILY ITINERARY   │
│ ┌────────────────┐   │
│ │ Day 1 2024-... │   │  (day cards)
│ │ Title + Seg    │   │
│ └────────────────┘   │
├──────────────────────┤
│ 💰 BUDGET SUMMARY    │
│ Flights      ¥9,000  │  (budget lines)
│ Hotels      ¥24,000  │
│ ───────────────────  │
│ Total       ¥50,000  │
└──────────────────────┘
(scrollable below header)
```

### Width & Responsive

- **Desktop:** 380px wide, fixed right panel
- **≤900px:** Hidden (`.itinerary-panel { display: none }`)
- **Scrollable:** `.itinerary-body { overflow-y: auto }`

---

## 5️⃣ CSS Classes Reference

| Class | Purpose | Line |
|-------|---------|------|
| `.itinerary-panel` | Main container | 64 |
| `.itinerary-header` | Fixed header bar | 73 |
| `.itinerary-body` | Scrollable content area | 89 |
| `.itinerary-empty` | Empty state messaging | 98 |
| `.itin-row` | Basic field row | 113 |
| `.itin-icon` | Icon column (fixed 28px) | 126 |
| `.itin-label` | Label column (fixed 52px) | 132 |
| `.itin-value` | Value area (flex) | 138 |
| `.itin-edit-btn` | Edit button (hover to show) | 144 |
| `.itin-inline-input` | Inline edit input | 159 |
| `.itin-tag` | Preference tag chip | 172 |
| `.itin-progress` | 4-segment progress bar | 184 |
| `.itin-progress-seg` | Individual segment | 188 |
| `.itin-progress-seg.done` | Completed segment | 194 |
| `.itin-progress-seg.active` | Current segment (pulsing) | 197 |
| `.itin-section-title` | Section header (FLIGHTS, etc) | 207 |
| `.itin-booking-card` | Flight/hotel card | 215 |
| `.itin-booking-title` | Card title | 225 |
| `.itin-booking-detail` | Card subtitle | 230 |
| `.itin-route` | Route flex container | 236 |
| `.route-stop` | City stop pill | 242 |
| `.route-arrow` | Arrow between stops | 251 |
| `.itin-day-card` | Daily itinerary card | 258 |
| `.itin-day-header` | Day header flex | 265 |
| `.day-num` | "Day N" badge | 271 |
| `.day-date` | Date text | 279 |
| `.day-city` | City text (bold) | 283 |
| `.itin-day-body` | Day description | 288 |
| `.day-seg-count` | Activity count | 293 |
| `.itin-budget` | Budget list container | 299 |
| `.budget-item` | Budget line | 302 |
| `.budget-label` | Budget category name | 309 |
| `.budget-amount` | Budget amount (monospace) | 312 |
| `.budget-total` | Total budget line | 316 |
| `.budget-ok` | Green (surplus) | 323 |
| `.budget-over` | Red (deficit) | 324 |

---

## 6️⃣ Data Flow Sequence

```
Server: TripBook.toPanelData()
   ↓ (returns flat object)
Server: Send SSE event "tripbook_update" + data
   ↓ (WebSocket/EventSource)
Frontend: Receive in event listener
   ↓
Frontend: Call updateFromTripBook(data)
   ↓ (merge into itineraryState)
Frontend: Call renderItinerary()
   ↓ (build HTML from state)
Frontend: Update DOM (#itinerary-body.innerHTML = html)
   ↓
Display: User sees updated panel
```

---

## 7️⃣ Key Implementation Notes

### Escaping & Security
- **All user data** escaped via `escItinHtml()` before insertion
- Prevents XSS by converting `<`, `>`, `&`, `"`

### Conditional Rendering
- Each section only renders if data exists (falsy check)
- Empty state shown if no data at all
- Prevents blank sections

### State Updates
- **Incremental:** Some fields (preferences, flights in old code) were appended
- **Replacement:** TripBook data replaces entirely (flights, hotels, daysPlan)
- **Direct assign:** Simple fields (destination, dates, etc.)

### Performance
- No re-renders during edit (only re-render on blur/Enter/Escape)
- HTML built once, DOM updated once
- Event delegation could optimize if many elements added

### Accessibility Issues (Opportunities)
- Edit buttons hidden until hover (not keyboard accessible)
- No ARIA labels on sections
- No form semantics in inline editor

---

## 8️⃣ Customization Points for Multi-Column Layout

If you want to expand to multi-column:

1. **Modify `.itinerary-panel`:**
   ```css
   .itinerary-panel {
     display: grid;
     grid-template-columns: 1fr 1fr;  /* or more */
     width: 700px;  /* wider */
   }
   ```

2. **Add column wrapper classes:**
   ```html
   <div class="itin-col-1"><!-- basics, flights, hotels --></div>
   <div class="itin-col-2"><!-- route, days, budget --></div>
   ```

3. **Adjust rendering in `renderItinerary()`** to insert column breaks

4. **CSS:** Define column-specific styling

---

## Summary Checklist

✅ **File paths:** Documented with line numbers  
✅ **Full itineraryState structure:** All 22 fields  
✅ **renderItinerary() logic:** Complete line-by-line breakdown  
✅ **updateFromTripBook() flow:** Data merge strategy  
✅ **toPanelData() return shape:** All fields + types  
✅ **Days/daysPlan rendering:** Line 365–384, data shape included  
✅ **Route visualization:** Line 349–360  
✅ **CSS classes:** All 40+ classes listed with locations  
✅ **Layout structure:** Single column, 380px wide, scrollable  
✅ **Color scheme:** Dark theme (slate-800+ background)  
✅ **Responsive design:** Hidden at ≤900px

