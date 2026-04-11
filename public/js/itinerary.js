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
  weatherList: null,  // [{ city, temp_c, description }] — 多城市天气
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
  '大交通确认',
  '规划行程',
  '行程总结'
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

// 城市英文名→中文名映射（天气 API 返回英文城市名，前端翻译显示）
const CITY_ZH = {
  'semporna': '仙本那', 'kota kinabalu': '亚庇', 'kuala lumpur': '吉隆坡',
  'penang': '槟城', 'langkawi': '兰卡威', 'malacca': '马六甲', 'melaka': '马六甲',
  'johor bahru': '新山', 'sandakan': '山打根', 'kuching': '古晋',
  'bangkok': '曼谷', 'chiang mai': '清迈', 'phuket': '普吉岛', 'pattaya': '芭提雅',
  'tokyo': '东京', 'osaka': '大阪', 'kyoto': '京都', 'nara': '奈良', 'fukuoka': '福冈',
  'sapporo': '札幌', 'okinawa': '冲绳', 'nagoya': '名古屋', 'kobe': '神户',
  'seoul': '首尔', 'busan': '釜山', 'jeju': '济州',
  'singapore': '新加坡', 'bali': '巴厘岛', 'jakarta': '雅加达',
  'hanoi': '河内', 'ho chi minh city': '胡志明市', 'da nang': '岘港',
  'manila': '马尼拉', 'cebu': '宿务', 'boracay': '长滩岛',
  'hong kong': '香港', 'macau': '澳门', 'taipei': '台北',
  'paris': '巴黎', 'london': '伦敦', 'rome': '罗马', 'barcelona': '巴塞罗那',
  'new york': '纽约', 'los angeles': '洛杉矶', 'sydney': '悉尼', 'melbourne': '墨尔本',
  'dubai': '迪拜', 'istanbul': '伊斯坦布尔', 'cairo': '开罗',
  'maldives': '马尔代夫', 'male': '马累',
  'beijing': '北京', 'shanghai': '上海', 'guangzhou': '广州', 'shenzhen': '深圳',
  'chengdu': '成都', 'hangzhou': '杭州', 'xian': '西安', "xi'an": '西安',
  'sanya': '三亚', 'lijiang': '丽江', 'kunming': '昆明', 'guilin': '桂林',
  'lhasa': '拉萨', 'chongqing': '重庆', 'nanjing': '南京', 'suzhou': '苏州',
};
function translateCity(name) {
  if (!name) return '';
  return CITY_ZH[name.toLowerCase().trim()] || name;
}

// 将内部7阶段映射到面板展示的4阶段
function mapPhase(raw) {
  if (raw <= 0) return 0;
  if (raw <= 1) return 1;     // 内部1 → 显示1 需求确认
  if (raw <= 2) return 2;     // 内部2 → 显示2 大交通确认
  if (raw <= 4) return 3;     // 内部3-4 → 显示3 规划行程（含行程框架+住宿+每日详情）
  return 4;                   // 内部5 → 显示4 行程总结
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
    itineraryState.phaseLabel = PHASE_LABELS[mapped] || '';
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
    flights: [], hotels: [], weather: null, weatherList: null,
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

  // ── 1. 行程标题（目的地主题） ──
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

  // ── 5. 天气（支持多城市，中文翻译） ──
  const weatherItems = s.weatherList || (s.weather ? [s.weather] : []);
  if (weatherItems.length > 0) {
    const weatherHtmlParts = weatherItems.map(w => {
      const desc = w.description ? translateWeather(w.description) : '';
      const descHtml = desc ? `，${escItinHtml(desc)}` : '';
      const cityName = translateCity(w.city);
      return `<span class="itin-weather-item">📍 ${escItinHtml(cityName)} ${w.temp_c}°C${descHtml}</span>`;
    }).join('');
    html += `<div class="itin-weather-bar">🌤️ ${weatherHtmlParts}</div>`;
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
// 完整快照 → 面板数据转换（复刻服务端 toPanelData 逻辑）
// ============================================================
function convertSnapshotToPanelData(snap) {
  const c = snap.constraints || {};
  const it = snap.itinerary || {};
  const dyn = snap.dynamic || {};

  const dest = c.destination;
  let destStr = '';
  if (dest) {
    const base = dest.value || '';
    if (dest.cities?.length && !/[（(]/.test(base)) {
      destStr = `${base}（${dest.cities.join('·')}）`;
    } else {
      destStr = base;
    }
  }

  const weatherEntries = Object.values(dyn.weather || {});
  const weatherList = weatherEntries.map(w => ({
    city: w.city, temp_c: w.current?.temp_c, description: w.current?.description
  }));
  const weather = weatherList.length === 1 ? weatherList[0] : null;

  return {
    destination: destStr,
    departCity: c.departCity?.value || '',
    dates: c.dates ? (c.dates.start ? `${c.dates.start} ~ ${c.dates.end}` : '') : '',
    days: c.dates?.days || 0,
    people: c.people?.count || 0,
    budget: c.budget?.value || '',
    preferences: c.preferences?.tags || [],
    phase: it.phase || 0,
    phaseLabel: it.phaseLabel || '',
    route: it.route || [],
    weather,
    weatherList: weatherList.length > 0 ? weatherList : null,
    budgetSummary: it.budgetSummary || null,
    daysPlan: (it.days || []).map(d => ({
      day: d.day, date: d.date, city: d.city, title: d.title,
      segments: (d.segments || []).map(seg => ({
        time: seg.time || '', title: seg.title || seg.activity || '',
        location: seg.location || '', duration: seg.duration || '',
        transport: seg.transport || '', transportTime: seg.transportTime || '',
        notes: seg.notes || '', type: seg.type || 'activity',
      })),
    })),
    flights: (dyn.flightQuotes || []).map(f => ({
      route: f.route, airline: f.airline,
      price: f.price_cny ? `¥${f.price_cny}` : `$${f.price_usd}`,
      time: f.duration, status: f.status,
    })),
    hotels: (dyn.hotelQuotes || []).map(h => ({
      name: h.name, city: h.city,
      price: h.price_total_cny ? `¥${h.price_total_cny}` : `$${h.price_per_night_usd}/晚`,
      nights: h.nights, status: h.status,
    })),
  };
}

// ============================================================
// TripBook 数据更新（从 tripbook_update SSE 事件）
// ============================================================
function updateFromTripBook(data) {
  if (!data) return;

  // 兼容完整 TripBook 快照格式（从历史对话恢复时可能是这种格式）
  if (data.constraints && !data.destination) {
    data = convertSnapshotToPanelData(data);
  }

  if (data.destination) itineraryState.destination = data.destination;
  if (data.departCity) itineraryState.departCity = data.departCity;
  if (data.dates) itineraryState.dates = data.dates;
  if (data.days) itineraryState.days = data.days;
  if (data.people) itineraryState.people = data.people;
  if (data.budget) itineraryState.budget = data.budget;
  if (data.phase) {
    const mapped = mapPhase(data.phase);
    itineraryState.phase = mapped;
    itineraryState.phaseLabel = PHASE_LABELS[mapped] || '';
  }
  if (data.preferences && data.preferences.length > 0) {
    itineraryState.preferences = data.preferences;
  }
  if (data.weather) {
    itineraryState.weather = data.weather;
  }
  if (Array.isArray(data.weatherList) && data.weatherList.length > 0) {
    itineraryState.weatherList = data.weatherList;
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
  // 只有存在可展开的 segments 时才显示全部展开/收起按钮
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

  // 优先按已知顺序展示，再展示其余项目（防止 AI 用不同 key 名导致漏项）
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

  // 先渲染已知顺序的项目
  for (const key of knownOrder) renderItem(key);
  // 再渲染其余未知项目（AI 可能新增的类别）
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
