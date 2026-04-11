/**
 * itinerary.js — 行程信息面板渲染与交互
 * 单列纵向布局：目的地标题 → 路线 → 基本信息 → 偏好/天气/进度 → 机票酒店 → 每日行程 → 预算
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
  // TripBook 扩展字段
  route: [],
  daysPlan: [],       // [{ day, date, city, title, segments[] }]
  budgetSummary: null
};

// 记录哪些 day 是展开的
const expandedDays = new Set();

const PHASE_LABELS = [
  '', // 0 = 未开始
  '需求确认',
  '规划行程',
  '完善细节',
  '预算总结'
];

// 天气英文→中文兜底翻译
const WEATHER_ZH = {
  'Clear': '晴', 'Sunny': '晴', 'Partly cloudy': '多云', 'Partly Cloudy': '多云',
  'Cloudy': '多云', 'Overcast': '阴', 'Mist': '薄雾', 'Fog': '雾',
  'Light rain': '小雨', 'Moderate rain': '中雨', 'Heavy rain': '大雨',
  'Light drizzle': '毛毛雨', 'Patchy rain possible': '可能有阵雨',
  'Patchy rain nearby': '附近有阵雨', 'Light rain shower': '阵雨',
  'Moderate or heavy rain shower': '中到大阵雨',
  'Thundery outbreaks possible': '可能有雷阵雨',
  'Thunderstorm': '雷暴', 'Snow': '雪', 'Light snow': '小雪',
  'Heavy snow': '大雪', 'Blizzard': '暴风雪',
  'Haze': '霾', 'Hot': '高温', 'Cold': '寒冷',
};
function translateWeather(desc) {
  if (!desc) return '';
  return WEATHER_ZH[desc] || WEATHER_ZH[desc.trim()] || desc;
}

// 将内部7阶段映射到面板展示的4阶段
function mapPhase(raw) {
  if (raw <= 0) return 0;
  if (raw <= 1) return 1;
  if (raw <= 3) return 2;
  if (raw <= 5) return 3;
  return 4;
}

// ============================================================
// 更新行程状态（增量合并）
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
    const mapped = mapPhase(data.phase);
    itineraryState.phase = mapped;
    itineraryState.phaseLabel = data.phaseLabel || PHASE_LABELS[mapped] || '';
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

  renderItinerary();
}

// ============================================================
// 清空行程状态
// ============================================================
function clearItinerary() {
  itineraryState = {
    destination: '', departCity: '', dates: '', days: 0,
    people: 0, budget: '', preferences: [],
    phase: 0, phaseLabel: '',
    flights: [], hotels: [], weather: null,
    route: [], daysPlan: [], budgetSummary: null
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
// 渲染行程面板（单列纵向布局）
// ============================================================
function renderItinerary() {
  const body = document.getElementById('itinerary-body');
  if (!body) return;

  const s = itineraryState;

  const hasData = s.destination || s.departCity || s.dates || s.days ||
                  s.people || s.budget || s.preferences.length > 0 || s.phase > 0;
  if (!hasData) return;

  let html = '';

  // ── 1. 目的地大标题 ──
  if (s.destination) {
    html += `<div class="itin-dest-title">${escItinHtml(s.destination)}</div>`;
  }

  // ── 2. 路线（紧跟标题下方） ──
  if (s.route && s.route.length > 0) {
    const stops = s.route.map((city, i) => {
      const isLast = i === s.route.length - 1;
      return `<span class="route-stop">${escItinHtml(city)}</span>${isLast ? '' : '<span class="route-arrow">→</span>'}`;
    }).join('');
    html += `<div class="itin-route-bar">${stops}</div>`;
  }

  // ── 3. 基本信息紧凑 grid ──
  const infoItems = [];
  if (s.dates || s.days) {
    const dateStr = s.dates ? escItinHtml(s.dates) : '';
    const daysSuffix = s.days ? (dateStr ? `(${s.days}天)` : `${s.days}天`) : '';
    infoItems.push({ icon: '📅', value: dateStr + daysSuffix, field: 'dates' });
  }
  if (s.people) {
    infoItems.push({ icon: '👥', value: `${s.people}人`, field: 'people' });
  }
  if (s.budget) {
    infoItems.push({ icon: '💰', value: escItinHtml(s.budget), field: 'budget' });
  }
  if (s.departCity) {
    infoItems.push({ icon: '🛫', value: escItinHtml(s.departCity), field: 'departCity' });
  }

  if (infoItems.length > 0) {
    html += '<div class="itin-info-grid">';
    for (const item of infoItems) {
      html += `<div class="itin-info-item" data-field="${item.field}">
        <span class="itin-icon">${item.icon}</span>
        <span class="itin-info-text">${item.value}</span>
        <button class="itin-edit-btn" data-field="${item.field}" title="修改">✏️</button>
      </div>`;
    }
    html += '</div>';
  }

  // ── 4. 偏好标签 ──
  if (s.preferences.length > 0) {
    const tagsHtml = s.preferences.map(p => `<span class="itin-tag">${escItinHtml(p)}</span>`).join('');
    html += `<div class="itin-tags-bar">🏷️ ${tagsHtml}</div>`;
  }

  // ── 5. 天气（中文翻译） ──
  if (s.weather) {
    const w = s.weather;
    const desc = w.description ? translateWeather(w.description) : '';
    const descHtml = desc ? `，${escItinHtml(desc)}` : '';
    html += `<div class="itin-weather-bar">🌤️ ${escItinHtml(w.city)} ${w.temp_c}°C${descHtml}</div>`;
  }

  // ── 6. 阶段进度 ──
  if (s.phase > 0) {
    let progressHtml = '<div class="itin-progress">';
    for (let i = 1; i <= 4; i++) {
      const cls = i < s.phase ? 'done' : (i === s.phase ? 'active' : '');
      progressHtml += `<div class="itin-progress-seg ${cls}"></div>`;
    }
    progressHtml += '</div>';
    const phaseText = `${escItinHtml(s.phaseLabel)}（${s.phase}/4）`;
    html += `<div class="itin-progress-bar">
      <span class="itin-progress-text">📊 ${phaseText}</span>
      ${progressHtml}
    </div>`;
  }

  // ── 7. 机票 ──
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

  // ── 8. 酒店 ──
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

  // ── 9. 每日行程 ──
  if (s.daysPlan && s.daysPlan.length > 0) {
    html += renderDaysPlan(s.daysPlan);
  }

  // ── 10. 预算摘要 ──
  if (s.budgetSummary) {
    html += renderBudgetSummary(s.budgetSummary);
  }

  // ── 组装到 DOM ──
  body.innerHTML = html;

  // 绑定编辑按钮事件
  body.querySelectorAll('.itin-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      startInlineEdit(btn);
    });
  });
}

// ============================================================
// Inline 编辑
// ============================================================
function startInlineEdit(btn) {
  const container = btn.closest('.itin-info-item');
  const valueEl = container.querySelector('.itin-info-text');
  const field = btn.dataset.field;
  const currentText = valueEl.textContent.trim();

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'itin-inline-input';
  input.value = currentText;
  valueEl.innerHTML = '';
  valueEl.appendChild(input);
  btn.style.display = 'none';
  input.focus();
  input.select();

  const commitEdit = () => {
    const newVal = input.value.trim();
    if (newVal && newVal !== currentText) {
      const fieldLabels = {
        departCity: '出发城市',
        dates: '出行日期',
        people: '出行人数',
        budget: '预算'
      };
      const label = fieldLabels[field] || field;
      const promptText = `${label}改为${newVal}`;

      const msgInput = document.getElementById('msg-input');
      if (msgInput) {
        msgInput.value = promptText;
        msgInput.focus();
        msgInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    renderItinerary();
  };

  input.addEventListener('blur', commitEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { renderItinerary(); }
  });
}

// ============================================================
// TripBook 数据更新（从 tripbook_update SSE 事件）
// ============================================================
function updateFromTripBook(data) {
  if (!data) return;

  if (data.destination) itineraryState.destination = data.destination;
  if (data.departCity) itineraryState.departCity = data.departCity;
  if (data.dates) itineraryState.dates = data.dates;
  if (data.days) itineraryState.days = data.days;
  if (data.people) itineraryState.people = data.people;
  if (data.budget) itineraryState.budget = data.budget;
  if (data.phase) {
    const mapped = mapPhase(data.phase);
    itineraryState.phase = mapped;
    itineraryState.phaseLabel = data.phaseLabel || PHASE_LABELS[mapped] || '';
  }
  if (data.preferences && data.preferences.length > 0) {
    itineraryState.preferences = data.preferences;
  }
  if (data.weather) {
    itineraryState.weather = data.weather;
  }

  // TripBook 扩展字段
  if (Array.isArray(data.route) && data.route.length > 0) {
    itineraryState.route = data.route;
  }
  if (Array.isArray(data.daysPlan) && data.daysPlan.length > 0) {
    itineraryState.daysPlan = data.daysPlan;
  }
  if (data.budgetSummary) {
    itineraryState.budgetSummary = data.budgetSummary;
  }

  // 机票/酒店：TripBook 提供完整列表，直接替换
  if (Array.isArray(data.flights)) {
    itineraryState.flights = data.flights;
  }
  if (Array.isArray(data.hotels)) {
    itineraryState.hotels = data.hotels;
  }

  renderItinerary();
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
  // 只切换 class，不重新渲染整个面板
  const card = document.getElementById(`day-card-${dayNum}`);
  if (card) {
    card.classList.toggle('expanded', expandedDays.has(dayNum));
  }
  // 更新"全部展开/收起"按钮文案
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
  renderItinerary();
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

  // 判断是否有任何 day 有 segments
  const anySegments = daysPlan.some(d => d.segments && d.segments.length > 0);
  const hasSegments = daysPlan.filter(d => d.segments && d.segments.length > 0);
  const allExpanded = hasSegments.length > 0 && hasSegments.every(d => expandedDays.has(d.day));
  const toggleText = allExpanded ? '全部收起' : '全部展开';

  let html = '<div class="itin-section-header">';
  html += '<span class="itin-section-title" style="margin:0">📋 每日行程</span>';
  if (anySegments) {
    html += `<button class="itin-toggle-all" id="toggle-all-btn" onclick="toggleAllDays()">${toggleText}</button>`;
  }
  html += '</div>';

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

    // 副标题（title 不截断，显示在 header 下方）
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
                     seg.type === 'hotel' ? 'hotel' : '';

    // 活动项
    html += `<div class="timeline-item">
      <div class="timeline-time">${escItinHtml(seg.time)}</div>
      <div class="timeline-dot-col">
        <div class="timeline-dot ${dotClass}"></div>
        ${!isLast ? '<div class="timeline-line"></div>' : ''}
      </div>
      <div class="timeline-content">
        <div class="timeline-title">${escItinHtml(seg.title)}</div>`;

    // 位置和时长
    const metaParts = [];
    if (seg.location) metaParts.push(`📍 ${escItinHtml(seg.location)}`);
    if (seg.duration) metaParts.push(escItinHtml(seg.duration));
    if (seg.notes) metaParts.push(escItinHtml(seg.notes));
    if (metaParts.length > 0) {
      html += `<div class="timeline-meta">${metaParts.join(' · ')}</div>`;
    }

    html += `</div></div>`;

    // 交通连接（当前活动到下一个活动之间）
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
  let html = '<div class="itin-section-title">💰 预算摘要</div>';
  html += '<div class="itin-budget">';

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

  html += '</div>';
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
