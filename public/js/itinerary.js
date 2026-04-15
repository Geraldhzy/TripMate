/**
 * itinerary.js — 行程详情面板（统一视图）
 */

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
};

// 记录哪些 day 是展开的
const expandedDays = new Set();

const PHASE_LABELS = [
  '', // 0 = 未开始
  '了解需求',
  '规划框架',
  '完善详情',
  '行程总结'
];

// ============================================================
// TripBook 数据更新（从 tripbook_update SSE 事件）
// ============================================================
function updateItinerary(data) {
  if (!data) return;

  if (data.destination) itineraryState.destination = data.destination;
  if (data.departCity) itineraryState.departCity = data.departCity;
  if (data.dates) itineraryState.dates = data.dates;
  if (data.days) itineraryState.days = data.days;
  if (data.people) itineraryState.people = data.people;
  if (data.budget) itineraryState.budget = data.budget;
  if (data.phase) {
    itineraryState.phase = data.phase;
    itineraryState.phaseLabel = PHASE_LABELS[data.phase] || '';
  }

  if (data.preferences && data.preferences.length > 0) {
    const existing = new Set(itineraryState.preferences);
    data.preferences.forEach(p => existing.add(p));
    itineraryState.preferences = Array.from(existing);
  }

  if (data.flights && data.flights.length > 0) {
    itineraryState.flights.push(...data.flights);
  }
  if (data.hotels && data.hotels.length > 0) {
    itineraryState.hotels.push(...data.hotels);
  }

  if (data.weather) {
    itineraryState.weather = data.weather;
  }

  renderPanel();
}

// ============================================================
// 清空行程状态
// ============================================================
function clearItinerary() {
  itineraryState = {
    destination: '', departCity: '', dates: '', days: 0,
    people: 0, budget: '', preferences: [],
    phase: 0, phaseLabel: '',
    flights: [], hotels: [], weather: null, weatherList: null,
    route: [], daysPlan: [], budgetSummary: null,
  };
  expandedDays.clear();

  const body = document.getElementById('itinerary-body');
  if (body) {
    body.innerHTML = `
      <div class="itinerary-empty">
        <div class="itinerary-empty-icon">✈️</div>
        <p>开始对话后，行程信息将在这里汇总</p>
      </div>
    `;
  }
}

// ============================================================
// TripBook 数据更新（从 tripbook_update SSE 事件）
// ============================================================
function updateFromTripBook(data) {
  if (!data) return;
  try {

  if (data.destination) itineraryState.destination = data.destination;
  if (data.departCity) itineraryState.departCity = data.departCity;
  if (data.dates) itineraryState.dates = data.dates;
  if (data.days) itineraryState.days = data.days;
  if (data.people) itineraryState.people = data.people;
  if (data.budget) itineraryState.budget = data.budget;
  if (data.phase) {
    itineraryState.phase = data.phase;
    itineraryState.phaseLabel = PHASE_LABELS[data.phase] || '';
  }
  if (data.preferences && data.preferences.length > 0) {
    itineraryState.preferences = data.preferences;
  }
  if (data.route && data.route.length > 0) {
    itineraryState.route = data.route;
  }
  if (data.daysPlan && data.daysPlan.length > 0) {
    itineraryState.daysPlan = data.daysPlan;
  }
  if (data.budgetSummary) {
    itineraryState.budgetSummary = data.budgetSummary;
  }
  if (data.flights) {
    itineraryState.flights = data.flights;
  }
  if (data.hotels) {
    itineraryState.hotels = data.hotels;
  }
  if (data.weather) {
    itineraryState.weather = data.weather;
  }
  if (data.weatherList) {
    itineraryState.weatherList = data.weatherList;
  }

  try { renderPanel(); } catch(e) { console.error('renderPanel error:', e); }
  } catch(e) {
    console.error('updateFromTripBook error:', e);
  }
}

// ============================================================
// 统一面板渲染
// ============================================================
function renderPanel() {
  const body = document.getElementById('itinerary-body');
  if (!body) return;

  const s = itineraryState;
  const hasData = s.destination || s.departCity || s.dates || s.days ||
                  s.people || s.budget || (s.preferences && s.preferences.length > 0) || s.phase > 0;
  if (!hasData) {
    body.innerHTML = `
      <div class="itinerary-empty">
        <div class="itinerary-empty-icon">✈️</div>
        <p>开始对话后，行程信息将在这里汇总</p>
      </div>`;
    return;
  }

  let html = '';

  // ── Section 1: 行程概要 ──
  html += renderSectionHeader();

  // ── Section 2: 每日行程（含航班、酒店、交通等所有 segments） ──
  html += renderSectionItinerary();

  // ── Section 3: 预算（仅在行程总结阶段展示） ──
  html += renderSectionBudget();

  body.innerHTML = html;
  body.scrollTop = 0;
}

// ── Section 1: 行程概要 ──
function renderSectionHeader() {
  const s = itineraryState;
  let html = '';

  // 目的地标题
  if (s.destination) {
    html += `<div class="itin-dest-title">${escItinHtml(s.destination)}</div>`;
  }

  // 路线（唯一出现位置）
  if (s.route && s.route.length > 0) {
    const stops = s.route.map((city, i) => {
      const isLast = i === s.route.length - 1;
      return `<span class="route-stop">${escItinHtml(city)}</span>${isLast ? '' : '<span class="route-arrow">→</span>'}`;
    }).join('');
    html += `<div class="itin-route-bar">${stops}</div>`;
  }

  // 信息 grid（纯展示）
  const infoItems = [];
  if (s.dates || s.days) {
    const dateStr = s.dates ? escItinHtml(s.dates) : '';
    const daysSuffix = s.days ? (dateStr ? `(${s.days}天)` : `${s.days}天`) : '';
    infoItems.push({ icon: '📅', value: dateStr + daysSuffix });
  }
  if (s.people) {
    infoItems.push({ icon: '👥', value: `${s.people}人` });
  }
  if (s.budget) {
    infoItems.push({ icon: '💰', value: escItinHtml(s.budget) });
  }
  if (s.departCity) {
    infoItems.push({ icon: '🛫', value: escItinHtml(s.departCity) });
  }

  if (infoItems.length > 0) {
    html += '<div class="itin-info-grid">';
    for (const item of infoItems) {
      html += `<div class="itin-info-item">
        <span class="itin-icon">${item.icon}</span>
        <span class="itin-info-text">${item.value}</span>
      </div>`;
    }
    html += '</div>';
  }

  // 偏好标签
  if (s.preferences.length > 0) {
    const tagsHtml = s.preferences.map(p => `<span class="itin-tag">${escItinHtml(p)}</span>`).join('');
    html += `<div class="itin-tags-bar">${tagsHtml}</div>`;
  }

  // 阶段状态（纯文字描述：当前在做什么 + 下一步做什么）
  if (s.phase > 0) {
    const PHASE_DESCS = [
      '',
      '正在了解你的需求和约束条件',
      '正在规划大交通和行程框架',
      '正在填充每日景点、美食和住宿',
      '行程规划完成'
    ];
    const NEXT_HINTS = [
      '',
      '接下来将规划大交通和行程框架',
      '接下来将填充每日详细安排',
      '接下来将生成行程总结和预算',
      ''
    ];
    const current = PHASE_DESCS[s.phase] || '';
    const next = NEXT_HINTS[s.phase] || '';
    let statusHtml = `<span class="itin-phase-current">${escItinHtml(current)}</span>`;
    if (next) {
      statusHtml += `<span class="itin-phase-next">${escItinHtml(next)}</span>`;
    }
    html += `<div class="itin-phase-status">${statusHtml}</div>`;
  }

  return html;
}

// ── Section 2: 每日行程 ──
function renderSectionItinerary() {
  const s = itineraryState;
  if (!s.daysPlan || s.daysPlan.length === 0) return '';
  return `<section class="panel-section">
    <div class="panel-section-header">📅 每日行程</div>
    ${renderDaysPlan(s.daysPlan)}
  </section>`;
}

// ── Section 3: 预算（仅在行程总结阶段展示） ──
function renderSectionBudget() {
  const s = itineraryState;

  // 仅在行程总结阶段（phase >= 4）且有详细预算拆解时才展示
  if (s.phase < 4 || !s.budgetSummary || !s.budgetSummary.total_cny) return '';

  return `<section class="panel-section">
    <div class="panel-section-header">💰 预算详情</div>
    ${renderBudgetSummary(s.budgetSummary)}
  </section>`;
}

// ============================================================
// 折叠/展开每日行程
// ============================================================
function toggleDay(dayNum) {
  if (expandedDays.has(dayNum)) {
    expandedDays.delete(dayNum);
  } else {
    expandedDays.add(dayNum);
  }
  const card = document.getElementById(`day-card-${dayNum}`);
  if (card) {
    card.classList.toggle('expanded', expandedDays.has(dayNum));
  }
  updateToggleAllText();
}

function toggleAllDays() {
  const daysPlan = itineraryState.daysPlan;
  const hasSegments = daysPlan.filter(d => d.segments && d.segments.length > 0);
  const allExpanded = hasSegments.length > 0 && hasSegments.every(d => expandedDays.has(d.day));

  if (allExpanded) {
    expandedDays.clear();
  } else {
    hasSegments.forEach(d => expandedDays.add(d.day));
  }
  renderPanel();
}

function updateToggleAllText() {
  const btn = document.getElementById('toggle-all-btn');
  if (!btn) return;
  const daysPlan = itineraryState.daysPlan;
  const hasSegments = daysPlan.filter(d => d.segments && d.segments.length > 0);
  const allExpanded = hasSegments.length > 0 && hasSegments.every(d => expandedDays.has(d.day));
  btn.textContent = allExpanded ? '全部收起' : '全部展开';
}

// ============================================================
// 渲染每日行程（可折叠 + 时间线）
// ============================================================
function renderDaysPlan(daysPlan) {
  if (!daysPlan || daysPlan.length === 0) return '';

  const anySegments = daysPlan.some(d => d.segments && d.segments.length > 0);
  const hasSegments = daysPlan.filter(d => d.segments && d.segments.length > 0);
  const allExpanded = hasSegments.length > 0 && hasSegments.every(d => expandedDays.has(d.day));
  const toggleText = allExpanded ? '全部收起' : '全部展开';

  let html = '';
  if (anySegments) {
    html += `<div style="text-align:right;padding:0 4px 6px"><button class="itin-toggle-all" id="toggle-all-btn" onclick="toggleAllDays()">${toggleText}</button></div>`;
  }

  for (const d of daysPlan) {
    const isExpanded = expandedDays.has(d.day);
    const expandedClass = isExpanded ? ' expanded' : '';
    const dateStr = d.date ? `<span class="day-date">${escItinHtml(d.date)}</span>` : '';
    const cityStr = d.city ? `<span class="day-city">${escItinHtml(d.city)}</span>` : '';
    const hasSegs = d.segments && d.segments.length > 0;

    html += `<div class="itin-day-card${expandedClass}${hasSegs ? ' has-segments' : ''}" id="day-card-${d.day}">
      <div class="itin-day-header" ${hasSegs ? `onclick="toggleDay(${d.day})"` : ''}>
        <span class="day-num">Day ${d.day}</span>
        ${dateStr}${cityStr}
        ${hasSegs ? '<span class="day-toggle">▶</span>' : ''}
      </div>`;

    if (d.title) {
      html += `<div class="itin-day-subtitle">${escItinHtml(d.title)}</div>`;
    }

    if (hasSegs) {
      html += `<div class="itin-day-detail">`;
      html += renderTimeline(d.segments);
      html += `</div>`;
    }

    html += `</div>`;
  }
  return html;
}

// ============================================================
// 渲染时间线
// ============================================================
function renderTimeline(segments) {
  if (!segments || segments.length === 0) return '';
  let html = '<div class="timeline">';

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    const dotClass = seg.type === 'meal' ? 'meal' :
                     seg.type === 'transport' ? 'transport' :
                     seg.type === 'flight' ? 'flight' :
                     seg.type === 'hotel' ? 'hotel' : '';

    // 航班和酒店使用醒目的卡片样式
    if (seg.type === 'flight' || seg.type === 'hotel') {
      const icon = seg.type === 'flight' ? '✈️' : '🏨';
      html += `<div class="timeline-item">
        <div class="timeline-time">${escItinHtml(seg.time)}</div>
        <div class="timeline-dot-col">
          <div class="timeline-dot ${dotClass}"></div>
          ${!isLast ? '<div class="timeline-line"></div>' : ''}
        </div>
        <div class="timeline-content">
          <div class="timeline-booking-card">
            <div class="timeline-booking-title">${icon} ${escItinHtml(seg.title)}</div>`;
      const metaParts = [];
      if (seg.location) metaParts.push(`📍 ${escItinHtml(seg.location)}`);
      if (seg.duration) metaParts.push(escItinHtml(seg.duration));
      if (seg.notes) metaParts.push(escItinHtml(seg.notes));
      if (metaParts.length > 0) {
        html += `<div class="timeline-booking-detail">${metaParts.join(' · ')}</div>`;
      }
      html += `</div></div></div>`;
      continue;
    }

    html += `<div class="timeline-item">
      <div class="timeline-time">${escItinHtml(seg.time)}</div>
      <div class="timeline-dot-col">
        <div class="timeline-dot ${dotClass}"></div>
        ${!isLast ? '<div class="timeline-line"></div>' : ''}
      </div>
      <div class="timeline-content">
        <div class="timeline-title">${escItinHtml(seg.title)}</div>`;

    const metaParts = [];
    if (seg.location) metaParts.push(`📍 ${escItinHtml(seg.location)}`);
    if (seg.duration) metaParts.push(escItinHtml(seg.duration));
    if (seg.notes) metaParts.push(escItinHtml(seg.notes));
    if (metaParts.length > 0) {
      html += `<div class="timeline-meta">${metaParts.join(' · ')}</div>`;
    }

    html += `</div></div>`;

    if (!isLast && seg.transport) {
      const transportText = seg.transportTime
        ? `${escItinHtml(seg.transport)} · ${escItinHtml(seg.transportTime)}`
        : escItinHtml(seg.transport);
      html += `<div class="timeline-transport">
        <div class="timeline-time"></div>
        <div class="timeline-dot-col">
          <div class="timeline-line"></div>
        </div>
        <div class="transport-info">🚶 ${transportText}</div>
      </div>`;
    }
  }

  html += '</div>';
  return html;
}

// ============================================================
// 渲染预算摘要
// ============================================================
function renderBudgetSummary(summary) {
  if (!summary || !summary.total_cny) return '';
  let html = '<div class="tab-content-section">';
  html += '<div class="tab-section-label">💰 预算摘要</div>';
  html += '<div class="itin-budget">';

  const META_KEYS = ['total_cny', 'budget_cny', 'remaining_cny'];
  const knownOrder = ['flights', 'hotels', 'accommodation', 'attractions', 'activities', 'meals', 'food', 'transport', 'transportation', 'misc', 'other', 'shopping', 'insurance', 'visa', 'communication'];
  const rendered = new Set();

  function renderItem(key) {
    if (rendered.has(key)) return;
    const item = summary[key];
    if (item && typeof item === 'object' && item.amount_cny) {
      rendered.add(key);
      html += `<div class="budget-item">
        <span class="budget-label">${escItinHtml(item.label || key)}</span>
        <span class="budget-amount">¥${item.amount_cny.toLocaleString()}</span>
      </div>`;
    }
  }

  for (const key of knownOrder) renderItem(key);
  for (const key of Object.keys(summary)) {
    if (!META_KEYS.includes(key)) renderItem(key);
  }

  html += `<div class="budget-item budget-total">
    <span class="budget-label">总计</span>
    <span class="budget-amount">¥${summary.total_cny.toLocaleString()}</span>
  </div>`;

  if (summary.budget_cny) {
    const remaining = summary.remaining_cny !== undefined ? summary.remaining_cny : (summary.budget_cny - summary.total_cny);
    const cls = remaining >= 0 ? 'budget-ok' : 'budget-over';
    html += `<div class="budget-item ${cls}">
      <span class="budget-label">${remaining >= 0 ? '剩余' : '超支'}</span>
      <span class="budget-amount">¥${Math.abs(remaining).toLocaleString()}</span>
    </div>`;
  }

  html += '</div></div>';
  return html;
}

// ============================================================
// 工具函数
// ============================================================
function escItinHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
