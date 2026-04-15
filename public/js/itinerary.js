/**
 * itinerary.js — 行程详情面板（统一视图）
 */

let itineraryState = {
  destination: '',
  departCity: '',
  theme: '',
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
// 记录刚被更新的 day（用于触发高亮动画）
let justUpdatedDays = new Set();

const PHASE_LABELS = [
  '', // 0 = 未开始
  '了解需求',
  '规划框架',
  '完善详情',
  '行程总结'
];

// ============================================================
// Debouncing for TripBook Updates - Prevents race conditions
// ============================================================
let updateTimeout = null;
let pendingUpdateData = null;

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
    destination: '', departCity: '', theme: '', dates: '', days: 0,
    people: 0, budget: '', preferences: [],
    phase: 0, phaseLabel: '',
    flights: [], hotels: [], weather: null, weatherList: null,
    route: [], daysPlan: [], budgetSummary: null,
    reminders: [], practicalInfo: [],
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
  
  // Store pending data and debounce rendering to prevent race conditions
  pendingUpdateData = data;
  
  // Clear any pending update timeout
  if (updateTimeout) clearTimeout(updateTimeout);
  
  // Schedule update with 100ms debounce
  updateTimeout = setTimeout(() => {
    try {
      const d = pendingUpdateData;
      if (!d) return;
      
      if (d.destination) itineraryState.destination = d.destination;
      if (d.departCity) itineraryState.departCity = d.departCity;
      if (d.theme) itineraryState.theme = d.theme;
      if (d.dates) itineraryState.dates = d.dates;
      if (d.days) itineraryState.days = d.days;
      if (d.people) itineraryState.people = d.people;
      if (d.budget) itineraryState.budget = d.budget;
      if (d.phase) {
        itineraryState.phase = d.phase;
        itineraryState.phaseLabel = PHASE_LABELS[d.phase] || '';
      }
      if (d.preferences && d.preferences.length > 0) {
        itineraryState.preferences = d.preferences;
      }
      if (d.route && d.route.length > 0) {
        itineraryState.route = d.route;
      }
      if (d.daysPlan && d.daysPlan.length > 0) {
        // 检测哪些天发生了变化（对比 segments 数量或内容）
        const changedDayNums = new Set();
        for (const newDay of d.daysPlan) {
          const oldDay = itineraryState.daysPlan.find(od => od.day === newDay.day);
          if (!oldDay) {
            // 新增的天
            changedDayNums.add(newDay.day);
          } else {
            // 对比 segments 内容是否变化
            const oldSig = JSON.stringify((oldDay.segments || []).map(s => s.time + '|' + s.title));
            const newSig = JSON.stringify((newDay.segments || []).map(s => s.time + '|' + s.title));
            if (oldSig !== newSig) {
              changedDayNums.add(newDay.day);
            }
          }
        }
        // 自动展开有变化的天
        for (const dayNum of changedDayNums) {
          expandedDays.add(dayNum);
        }
        justUpdatedDays = changedDayNums;
        itineraryState.daysPlan = d.daysPlan;
      }
      if (d.budgetSummary) {
        itineraryState.budgetSummary = d.budgetSummary;
      }
      if (d.flights) {
        itineraryState.flights = d.flights;
      }
      if (d.hotels) {
        itineraryState.hotels = d.hotels;
      }
      if (d.weather) {
        itineraryState.weather = d.weather;
      }
      if (d.weatherList) {
        itineraryState.weatherList = d.weatherList;
      }
      if (d.reminders && d.reminders.length > 0) {
        itineraryState.reminders = d.reminders;
      }
      if (d.practicalInfo && d.practicalInfo.length > 0) {
        itineraryState.practicalInfo = d.practicalInfo;
      }
      
      try {
        renderPanel();
        // 对刚更新的 day card 触发高亮动画 + 滚动到可视区
        if (justUpdatedDays.size > 0) {
          let firstCard = null;
          for (const dayNum of justUpdatedDays) {
            const card = document.getElementById(`day-card-${dayNum}`);
            if (card) {
              card.classList.add('day-updated');
              if (!firstCard) firstCard = card;
              // 动画结束后移除 class
              setTimeout(() => card.classList.remove('day-updated'), 1500);
            }
          }
          // 平滑滚动到第一个更新的 card
          if (firstCard) {
            setTimeout(() => firstCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
          }
          justUpdatedDays = new Set();
        }
      } catch(e) { console.error('renderPanel error:', e); }
    } catch(e) {
      console.error('updateFromTripBook error:', e);
    }
    
    // Clear pending data after processing
    pendingUpdateData = null;
    updateTimeout = null;
  }, 100);
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

  // ── Section 3: 预算（有数据就展示） ──
  html += renderSectionBudget();

  // ── Section 4: 行前准备（有数据就展示） ──
  html += renderSectionChecklist();

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

  // 旅行主题
  if (s.theme) {
    html += `<div class="itin-theme">${escItinHtml(s.theme)}</div>`;
  }

  // 路线
  if (s.route && s.route.length > 0) {
    const stops = s.route.map((city, i) => {
      const isLast = i === s.route.length - 1;
      return `<span class="route-stop">${escItinHtml(city)}</span>${isLast ? '' : '<span class="route-arrow">→</span>'}`;
    }).join('');
    html += `<div class="itin-route-bar">${stops}</div>`;
  }

  // 信息条（紧凑单行）
  const infoParts = [];
  if (s.dates || s.days) {
    const dateStr = s.dates ? escItinHtml(s.dates) : '';
    const daysSuffix = s.days ? `${s.days}天` : '';
    if (dateStr && daysSuffix) {
      infoParts.push(`📅 ${dateStr} · ${daysSuffix}`);
    } else {
      infoParts.push(`📅 ${dateStr || daysSuffix}`);
    }
  }
  if (s.people) infoParts.push(`👥 ${s.people}人`);
  if (s.budget) infoParts.push(`💰 ${escItinHtml(s.budget)}`);
  if (s.departCity) infoParts.push(`🛫 ${escItinHtml(s.departCity)}出发`);

  if (infoParts.length > 0) {
    html += `<div class="itin-info-row">${infoParts.join('<span class="itin-info-sep">·</span>')}</div>`;
  }

  // 偏好标签
  if (s.preferences.length > 0) {
    const tagsHtml = s.preferences.map(p => `<span class="itin-tag">${escItinHtml(p)}</span>`).join('');
    html += `<div class="itin-tags-bar">${tagsHtml}</div>`;
  }

  // 进度条
  if (s.phase > 0) {
    html += renderProgressBar(s.phase);
  }

  return html;
}

// ── 阶段进度条 ──
function renderProgressBar(phase) {
  const steps = [
    { label: '了解需求', done: '需求已确认 ✓', active: '了解你的出行需求...' },
    { label: '规划框架', done: '框架已确定 ✓', active: '规划交通和行程框架...' },
    { label: '完善详情', done: '详情已完善 ✓', active: '完善每日景点和住宿...' },
    { label: '行程总结', done: '规划完成 🎉', active: '生成预算和行前准备...' },
  ];

  // 找到当前激活步骤的描述文案
  const activeStep = steps[phase - 1];
  const statusText = phase <= 4
    ? (phase === 4 && activeStep ? activeStep.done : (activeStep ? activeStep.active : ''))
    : '';

  let html = '<div class="itin-progress">';

  // 步骤条：紧凑的胶囊式横排
  html += '<div class="itin-progress-steps">';
  for (let i = 0; i < steps.length; i++) {
    const stepNum = i + 1;
    const isDone = stepNum < phase;
    const isActive = stepNum === phase;
    const isFinal = phase === 4 && stepNum === 4; // 最终完成态

    let cls = 'itin-step';
    if (isDone || isFinal) cls += ' done';
    else if (isActive) cls += ' active';

    html += `<div class="${cls}">`;
    if (isDone || isFinal) {
      html += `<span class="itin-step-icon">✓</span>`;
    } else if (isActive) {
      html += `<span class="itin-step-dot"></span>`;
    }
    html += `<span class="itin-step-text">${steps[i].label}</span>`;
    html += `</div>`;
  }
  html += '</div>';

  // 状态描述：紧贴在步骤条下方
  if (statusText) {
    html += `<div class="itin-progress-hint">${escItinHtml(statusText)}</div>`;
  }

  html += '</div>';
  return html;
}

// ── Section 2: 每日行程 ──
function renderSectionItinerary() {
  const s = itineraryState;
  if (!s.daysPlan || s.daysPlan.length === 0) return '';
  return `<div class="itin-divider"></div>
  <section class="panel-section">
    <div class="panel-section-header">每日行程</div>
    ${renderDaysPlan(s.daysPlan)}
  </section>`;
}

// ── Section 3: 预算（有数据就展示） ──
function renderSectionBudget() {
  const s = itineraryState;
  if (!s.budgetSummary || !s.budgetSummary.total_cny) return '';

  return `<section class="panel-section">
    <div class="panel-section-header">💰 预算概览</div>
    ${renderBudgetSummary(s.budgetSummary)}
  </section>`;
}

// ── Section 4: 行前准备（reminders + practicalInfo） ──
function renderSectionChecklist() {
  const s = itineraryState;
  const hasReminders = s.reminders && s.reminders.length > 0;
  const hasPractical = s.practicalInfo && s.practicalInfo.length > 0;
  if (!hasReminders && !hasPractical) return '';

  let html = '<section class="panel-section">';
  html += '<div class="panel-section-header">📋 行前准备</div>';

  // 实用信息
  if (hasPractical) {
    html += '<div class="itin-practical">';
    for (const item of s.practicalInfo) {
      const icon = item.icon || 'ℹ️';
      html += `<div class="itin-practical-item">
        <span class="itin-practical-icon">${icon}</span>
        <div class="itin-practical-body">
          <div class="itin-practical-cat">${escItinHtml(item.category)}</div>
          <div class="itin-practical-text">${escItinHtml(item.content)}</div>
        </div>
      </div>`;
    }
    html += '</div>';
  }

  // 行前清单
  if (hasReminders) {
    html += '<div class="itin-reminders">';
    html += '<div class="itin-reminders-title">出发前记得</div>';
    for (const r of s.reminders) {
      html += `<div class="itin-reminder-item">
        <span class="itin-reminder-check">☐</span>
        <span>${escItinHtml(r)}</span>
      </div>`;
    }
    html += '</div>';
  }

  html += '</section>';
  return html;
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
