/**
 * itinerary.js — 行程信息面板渲染与交互
 * 两列布局：左栏基本条件 / 右栏详细行程
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
  '确认需求',
  '规划行程',
  '完善细节',
  '预算总结'
];

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
// 渲染行程面板（两列布局）
// ============================================================
function renderItinerary() {
  const body = document.getElementById('itinerary-body');
  if (!body) return;

  const s = itineraryState;

  const hasData = s.destination || s.departCity || s.dates || s.days ||
                  s.people || s.budget || s.preferences.length > 0 || s.phase > 0;
  if (!hasData) return;

  // 判断是否有右栏内容
  const hasRightCol = (s.route && s.route.length > 0) ||
                      (s.daysPlan && s.daysPlan.length > 0) ||
                      s.budgetSummary;

  // ── 左栏：基本条件 ──
  let leftHtml = '';

  if (s.destination) {
    leftHtml += buildRow('📍', '目的地', escItinHtml(s.destination));
  }
  if (s.departCity) {
    leftHtml += buildRow('🛫', '出发', escItinHtml(s.departCity), 'departCity');
  }
  if (s.dates || s.days) {
    const dateStr = s.dates ? escItinHtml(s.dates) : '';
    const daysSuffix = s.days ? (dateStr ? `（${s.days}天）` : `${s.days}天`) : '';
    leftHtml += buildRow('📅', '日期', dateStr + daysSuffix, 'dates');
  }
  if (s.people) {
    leftHtml += buildRow('👥', '人数', `${s.people}人`, 'people');
  }
  if (s.budget) {
    leftHtml += buildRow('💰', '预算', escItinHtml(s.budget), 'budget');
  }
  if (s.preferences.length > 0) {
    const tagsHtml = s.preferences.map(p => `<span class="itin-tag">${escItinHtml(p)}</span>`).join('');
    leftHtml += buildRow('🏷️', '偏好', tagsHtml);
  }
  if (s.weather) {
    const w = s.weather;
    const desc = w.description ? `，${escItinHtml(w.description)}` : '';
    leftHtml += buildRow('🌤️', '天气', `${escItinHtml(w.city)} ${w.temp_c}°C${desc}`);
  }

  // 阶段进度
  if (s.phase > 0) {
    let progressHtml = '<div class="itin-progress">';
    for (let i = 1; i <= 4; i++) {
      const cls = i < s.phase ? 'done' : (i === s.phase ? 'active' : '');
      progressHtml += `<div class="itin-progress-seg ${cls}"></div>`;
    }
    progressHtml += '</div>';
    const phaseText = `${escItinHtml(s.phaseLabel)}（${s.phase}/4）`;
    leftHtml += `<div class="itin-row">
      <span class="itin-icon">📊</span>
      <span class="itin-label">进度</span>
      <div class="itin-value">
        <div style="margin-bottom:6px">${phaseText}</div>
        ${progressHtml}
      </div>
    </div>`;
  }

  // 机票
  if (s.flights.length > 0) {
    leftHtml += '<div class="itin-section-title">✈️ 机票</div>';
    s.flights.forEach(f => {
      leftHtml += `<div class="itin-booking-card">
        <div class="itin-booking-title">${escItinHtml(f.route || '')}</div>
        <div class="itin-booking-detail">
          ${f.airline ? escItinHtml(f.airline) + ' · ' : ''}${f.price ? escItinHtml(f.price) : ''}${f.time ? ' · ' + escItinHtml(f.time) : ''}
        </div>
      </div>`;
    });
  }

  // 酒店
  if (s.hotels.length > 0) {
    leftHtml += '<div class="itin-section-title">🏨 酒店</div>';
    s.hotels.forEach(h => {
      leftHtml += `<div class="itin-booking-card">
        <div class="itin-booking-title">${escItinHtml(h.name || '')}</div>
        <div class="itin-booking-detail">
          ${h.nights ? h.nights + '晚 · ' : ''}${h.price ? escItinHtml(h.price) : ''}
        </div>
      </div>`;
    });
  }

  // ── 右栏：详细行程 ──
  let rightHtml = '';

  if (s.route && s.route.length > 0) {
    rightHtml += renderRoute(s.route);
  }
  if (s.daysPlan && s.daysPlan.length > 0) {
    rightHtml += renderDaysPlan(s.daysPlan);
  }
  if (s.budgetSummary) {
    rightHtml += renderBudgetSummary(s.budgetSummary);
  }

  // ── 组装 ──
  if (hasRightCol) {
    body.innerHTML = `<div class="itin-two-col">
      <div class="itin-col-left">${leftHtml}</div>
      <div class="itin-col-right">${rightHtml}</div>
    </div>`;
  } else {
    // 无右栏内容时用单列
    body.innerHTML = leftHtml;
  }

  // 绑定编辑按钮事件
  body.querySelectorAll('.itin-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      startInlineEdit(btn);
    });
  });
}

// ============================================================
// 构建单行
// ============================================================
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

// ============================================================
// Inline 编辑
// ============================================================
function startInlineEdit(btn) {
  const row = btn.closest('.itin-row');
  const valueEl = row.querySelector('.itin-value');
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
// 渲染路线可视化
// ============================================================
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
}

// ============================================================
// 渲染每日行程（可折叠 + 时间线）
// ============================================================
function renderDaysPlan(daysPlan) {
  if (!daysPlan || daysPlan.length === 0) return '';
  let html = '<div class="itin-section-title">📋 每日行程</div>';

  for (const d of daysPlan) {
    const isExpanded = expandedDays.has(d.day);
    const expandedClass = isExpanded ? ' expanded' : '';
    const dateStr = d.date ? `<span class="day-date">${escItinHtml(d.date)}</span>` : '';
    const cityStr = d.city ? `<span class="day-city">${escItinHtml(d.city)}</span>` : '';
    const titleStr = d.title ? `<span class="day-title">${escItinHtml(d.title)}</span>` : '';
    const hasSegments = d.segments && d.segments.length > 0;
    const segCount = hasSegments ? d.segments.length : 0;

    html += `<div class="itin-day-card${expandedClass}" id="day-card-${d.day}">
      <div class="itin-day-header" onclick="toggleDay(${d.day})">
        <span class="day-num">Day ${d.day}</span>
        ${dateStr}${cityStr}
        ${titleStr}
        <span class="day-toggle">▶</span>
      </div>`;

    if (hasSegments) {
      // 详细时间线（折叠区域）
      html += `<div class="itin-day-detail">`;
      html += renderTimeline(d.segments);
      html += `</div>`;
    } else {
      // 无 segments 时显示摘要
      const bodyText = d.title ? escItinHtml(d.title) : '';
      const segInfo = segCount > 0 ? `<span class="day-seg-count">${segCount}项活动</span>` : '';
      if (bodyText || segInfo) {
        html += `<div class="itin-day-body">${bodyText}${segInfo ? ' · ' + segInfo : ''}</div>`;
      }
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
