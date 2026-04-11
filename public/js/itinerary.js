/**
 * itinerary.js — 行程信息面板渲染与交互
 * 展示 AI 在规划过程中逐步确认的行程参数
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
  daysPlan: [],
  budgetSummary: null
};

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
  if (raw <= 1) return 1; // 锁定约束 → 确认需求
  if (raw <= 3) return 2; // 机票查询+构建框架 → 规划行程
  if (raw <= 5) return 3; // 关键预订+每日详情 → 完善细节
  return 4;               // 预算汇总+导出总结 → 预算总结
}

// ============================================================
// 更新行程状态（增量合并）
// ============================================================
function updateItinerary(data) {
  if (!data) return;

  // 合并简单字段
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

  // 合并数组字段
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
// 渲染行程面板
// ============================================================
function renderItinerary() {
  const body = document.getElementById('itinerary-body');
  if (!body) return;

  const s = itineraryState;

  // 如果完全没有数据，保持空状态
  const hasData = s.destination || s.departCity || s.dates || s.days ||
                  s.people || s.budget || s.preferences.length > 0 || s.phase > 0;
  if (!hasData) return;

  let html = '';

  // 目的地
  if (s.destination) {
    html += buildRow('📍', '目的地', escItinHtml(s.destination));
  }

  // 出发城市
  if (s.departCity) {
    html += buildRow('🛫', '出发', escItinHtml(s.departCity), 'departCity');
  }

  // 日期 + 天数
  if (s.dates || s.days) {
    const dateStr = s.dates ? escItinHtml(s.dates) : '';
    const daysSuffix = s.days ? (dateStr ? `（${s.days}天）` : `${s.days}天`) : '';
    html += buildRow('📅', '日期', dateStr + daysSuffix, 'dates');
  }

  // 人数
  if (s.people) {
    html += buildRow('👥', '人数', `${s.people}人`, 'people');
  }

  // 预算
  if (s.budget) {
    html += buildRow('💰', '预算', escItinHtml(s.budget), 'budget');
  }

  // 偏好标签
  if (s.preferences.length > 0) {
    const tagsHtml = s.preferences.map(p => `<span class="itin-tag">${escItinHtml(p)}</span>`).join('');
    html += buildRow('🏷️', '偏好', tagsHtml);
  }

  // 天气
  if (s.weather) {
    const w = s.weather;
    const desc = w.description ? `，${escItinHtml(w.description)}` : '';
    html += buildRow('🌤️', '天气', `${escItinHtml(w.city)} ${w.temp_c}°C${desc}`);
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
    html += `<div class="itin-row">
      <span class="itin-icon">📊</span>
      <span class="itin-label">进度</span>
      <div class="itin-value">
        <div style="margin-bottom:6px">${phaseText}</div>
        ${progressHtml}
      </div>
    </div>`;
  }

  // 机票信息
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

  // 酒店信息
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

  // 路线可视化（TripBook 扩展）
  if (s.route && s.route.length > 0) {
    html += renderRoute(s.route);
  }

  // 每日行程摘要（TripBook 扩展）
  if (s.daysPlan && s.daysPlan.length > 0) {
    html += renderDaysPlan(s.daysPlan);
  }

  // 预算摘要（TripBook 扩展）
  if (s.budgetSummary) {
    html += renderBudgetSummary(s.budgetSummary);
  }

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
// Inline 编辑：点击编辑按钮后替换为输入框
// ============================================================
function startInlineEdit(btn) {
  const row = btn.closest('.itin-row');
  const valueEl = row.querySelector('.itin-value');
  const field = btn.dataset.field;
  const currentText = valueEl.textContent.trim();

  // 替换为 input
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
      // 生成修改提示文本，填入聊天输入框
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
        // 触发 auto-resize
        msgInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    // 重新渲染
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

  // TripBook 的 toPanelData() 输出直接映射到 itineraryState
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
// 渲染每日行程摘要
// ============================================================
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

// ============================================================
// 渲染预算摘要
// ============================================================
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
