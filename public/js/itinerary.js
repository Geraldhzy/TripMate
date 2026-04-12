/**
 * itinerary.js — 行程详情面板（Tab 导航架构）
 * 9 个 Tab：总览 | 行前准备 | 交通安排 | 住宿 | 餐饮 | 景点活动 | 预算 | 完整行程 | 重要信息
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
  // TripBook 扩展字段
  route: [],
  daysPlan: [],
  budgetSummary: null,
  // Tab 新增字段
  reminders: [],
  exchangeRates: [],
  webSearchSummaries: [],
  specialRequests: [],
};

// 当前激活的 Tab
let currentTab = 'overview';

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

// 城市英文名→中文名映射
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
  if (raw <= 1) return 1;
  if (raw <= 2) return 2;
  if (raw <= 4) return 3;
  return 4;
}

// ============================================================
// Tab 初始化
// ============================================================
function initTabs() {
  try {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentTab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderCurrentTab();
      });
    });
  } catch(e) {
    console.error('initTabs error:', e);
  }
}

// DOMContentLoaded
document.addEventListener('DOMContentLoaded', initTabs);

// ============================================================
// 切换 Tab（从 HTML onclick 调用）
// ============================================================
function switchTab(tabName) {
  currentTab = tabName;
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderCurrentTab();
  }
}


// ============================================================
// 更新行程状态（增量合并 — 兼容旧调用方式）
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

  renderCurrentTab();
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
    reminders: [], exchangeRates: [], webSearchSummaries: [], specialRequests: [],
  };
  expandedDays.clear();
  currentTab = 'overview';

  // 重置 Tab 激活状态
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const overviewBtn = document.querySelector('.tab-btn[data-tab="overview"]');
  if (overviewBtn) overviewBtn.classList.add('active');

  const body = document.getElementById('itinerary-body');
  if (body) {
    body.innerHTML = `
      <div class="itinerary-empty">
        <div class="itinerary-empty-icon">✈️</div>
        <p>开始对话后，行程信息将在这里汇总</p>
      </div>
    `;
  }
  updateTabBadges();
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
    // 新增 4 个字段
    reminders: it.reminders || [],
    exchangeRates: Object.values(dyn.exchangeRates || {}).map(r => ({
      from: r.from, to: r.to, rate: r.rate, last_updated: r.last_updated,
    })),
    webSearchSummaries: (dyn.webSearches || []).map(s => ({
      query: s.query, summary: s.summary || '', fetched_at: s.fetched_at,
    })),
    specialRequests: (c.specialRequests || []).map(r => ({
      type: r.type, value: r.value, confirmed: r.confirmed,
    })),
  };
}

// ============================================================
// TripBook 数据更新（从 tripbook_update SSE 事件）
// ============================================================
function updateFromTripBook(data) {
  if (!data) return;
  try {

  // 兼容完整 TripBook 快照格式
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

  // 新增 4 个字段
  if (Array.isArray(data.reminders)) {
    itineraryState.reminders = data.reminders;
  }
  if (Array.isArray(data.exchangeRates) && data.exchangeRates.length > 0) {
    itineraryState.exchangeRates = data.exchangeRates;
  }
  if (Array.isArray(data.webSearchSummaries) && data.webSearchSummaries.length > 0) {
    itineraryState.webSearchSummaries = data.webSearchSummaries;
  }
  if (Array.isArray(data.specialRequests) && data.specialRequests.length > 0) {
    itineraryState.specialRequests = data.specialRequests;
  }

  try { renderCurrentTab(); } catch(e) { console.error('renderCurrentTab error:', e); }
  } catch(e) {
    console.error('updateFromTripBook error:', e);
  }
}

// ============================================================
// Tab 调度器
// ============================================================
function renderCurrentTab() {
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
    try { updateTabBadges(); } catch(e) { console.warn('updateTabBadges error:', e); }
    return;
  }

  const renderers = {
    overview: renderOverviewTab,
    prep: renderPrepTab,
    transport: renderTransportTab,
    hotel: renderHotelTab,
    food: renderFoodTab,
    attraction: renderAttractionTab,
    budget: renderBudgetTab,
    itinerary: renderItineraryTab,
    info: renderInfoTab,
  };

  try {
    body.innerHTML = (renderers[currentTab] || renderOverviewTab)();
  } catch(e) {
    console.error('Tab render error [' + currentTab + ']:', e);
    body.innerHTML = '<div class="itinerary-empty"><p>渲染出错，请切换其他 Tab</p></div>';
  }
  body.scrollTop = 0;
  try { updateTabBadges(); } catch(e) { console.warn('updateTabBadges error:', e); }

  // 绑定编辑按钮事件（总览 Tab）
  if (currentTab === 'overview') {
    body.querySelectorAll('.itin-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        startInlineEdit(btn);
      });
    });
  }
}

// ============================================================
// Tab 徽标（显示各 Tab 数据条目数）
// ============================================================
function updateTabBadges() {
  const s = itineraryState;
  const counts = {
    prep: s.reminders.length + s.exchangeRates.length + s.specialRequests.length,
    transport: s.flights.length + extractSegmentsByType(['transport', 'flight']).reduce((n, d) => n + d.segments.length, 0),
    hotel: s.hotels.length,
    food: extractSegmentsByType(['meal', 'food', 'restaurant']).reduce((n, d) => n + d.segments.length, 0),
    attraction: extractSegmentsByType(['attraction', 'activity', 'sightseeing']).reduce((n, d) => n + d.segments.length, 0),
    budget: s.budgetSummary ? 1 : 0,
    itinerary: s.daysPlan.length,
    info: (s.weatherList || (s.weather ? [s.weather] : [])).length +
          s.webSearchSummaries.length,
  };

  for (const [tab, count] of Object.entries(counts)) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (!btn) continue;
    let badge = btn.querySelector('.tab-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'tab-badge';
        btn.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  }
}

// ============================================================
// 工具：从 daysPlan segments 按类型提取
// ============================================================
function extractSegmentsByType(types) {
  const result = [];
  for (const day of itineraryState.daysPlan || []) {
    const matched = (day.segments || []).filter(seg =>
      types.some(t => (seg.type || '').toLowerCase().includes(t))
    );
    if (matched.length > 0) {
      result.push({ day: day.day, date: day.date, city: day.city, segments: matched });
    }
  }
  return result;
}

// ============================================================
// 渲染段落提取卡片（餐饮/景点通用）
// ============================================================
function renderExtractedSegments(groups, emptyIcon, emptyText) {
  if (groups.length === 0) {
    return `<div class="tab-empty">
      <span class="tab-empty-icon">${emptyIcon}</span>
      <p>${emptyText}</p>
    </div>`;
  }

  let html = '<div class="tab-content-section">';
  for (const g of groups) {
    html += `<div class="segment-extract-group">
      <div class="segment-extract-day">
        <span class="day-badge">Day ${g.day}</span>
        ${g.date ? escItinHtml(g.date) : ''} ${g.city ? '· ' + escItinHtml(g.city) : ''}
      </div>`;
    for (const seg of g.segments) {
      const metaParts = [];
      if (seg.time) metaParts.push(escItinHtml(seg.time));
      if (seg.location) metaParts.push('📍 ' + escItinHtml(seg.location));
      if (seg.duration) metaParts.push(escItinHtml(seg.duration));
      if (seg.notes) metaParts.push(escItinHtml(seg.notes));
      html += `<div class="segment-extract-card">
        <div class="segment-extract-title">${escItinHtml(seg.title)}</div>
        ${metaParts.length > 0 ? `<div class="segment-extract-meta">${metaParts.join(' · ')}</div>` : ''}
      </div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ============================================================
// Tab 1: 总览
// ============================================================
function renderOverviewTab() {
  const s = itineraryState;
  let html = '';

  // 目的地标题
  if (s.destination) {
    html += `<div class="itin-dest-title">${escItinHtml(s.destination)}</div>`;
  }

  // 路线
  if (s.route && s.route.length > 0) {
    const stops = s.route.map((city, i) => {
      const isLast = i === s.route.length - 1;
      return `<span class="route-stop">${escItinHtml(city)}</span>${isLast ? '' : '<span class="route-arrow">→</span>'}`;
    }).join('');
    html += `<div class="itin-route-bar">${stops}</div>`;
  }

  // 基本信息 grid
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

  // 偏好标签
  if (s.preferences.length > 0) {
    const tagsHtml = s.preferences.map(p => `<span class="itin-tag">${escItinHtml(p)}</span>`).join('');
    html += `<div class="itin-tags-bar">🏷️ ${tagsHtml}</div>`;
  }

  // 天气
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

  // 进度条
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

  // 行程预览（新增）- 显示前2-3天的概览
  if (s.daysPlan && s.daysPlan.length > 0) {
    const previewDays = s.daysPlan.slice(0, Math.min(3, s.daysPlan.length));
    const hasDaysWithSegments = previewDays.some(d => d.segments && d.segments.length > 0);
    
    if (hasDaysWithSegments) {
      html += '<div class="itin-section">';
      html += '<div class="itin-section-header">';
      html += '<span class="itin-section-title">📅 行程预览</span>';
      if (s.daysPlan.length > 3) {
        html += '<button class="itin-view-full" onclick="switchTab(\'itinerary\')">查看全部 →</button>';
      }
      html += '</div>';

      for (const d of previewDays) {
        if (!d.segments || d.segments.length === 0) continue;
        
        const dateStr = d.date ? `<span class="day-date">${escItinHtml(d.date)}</span>` : '';
        const cityStr = d.city ? `<span class="day-city">${escItinHtml(d.city)}</span>` : '';
        
        html += `<div class="itin-day-preview">
          <div class="itin-day-header-compact">
            <span class="day-num">Day ${d.day}</span>
            ${dateStr}${cityStr}
          </div>`;
        
        if (d.title) {
          html += `<div class="itin-day-subtitle">${escItinHtml(d.title)}</div>`;
        }

        // 显示前3个活动的简洁时间轴
        const previewSegments = d.segments.slice(0, 3);
        html += '<div class="timeline-compact">';
        for (let i = 0; i < previewSegments.length; i++) {
          const seg = previewSegments[i];
          const isLast = i === previewSegments.length - 1;
          const dotClass = seg.type === 'meal' ? 'meal' :
                           seg.type === 'transport' ? 'transport' :
                           seg.type === 'hotel' ? 'hotel' : '';

          html += `<div class="timeline-item-compact">
            <div class="timeline-time-compact">${escItinHtml(seg.time)}</div>
            <div class="timeline-dot-col-compact">
              <div class="timeline-dot ${dotClass}"></div>
              ${!isLast ? '<div class="timeline-line-compact"></div>' : ''}
            </div>
            <div class="timeline-content-compact">
              <div class="timeline-title-compact">${escItinHtml(seg.title)}</div>`;

          if (seg.location) {
            html += `<div class="timeline-location">📍 ${escItinHtml(seg.location)}</div>`;
          }

          html += `</div></div>`;
        }
        
        if (d.segments.length > 3) {
          html += `<div class="timeline-more">+${d.segments.length - 3} 更多</div>`;
        }

        html += '</div>'; // timeline-compact
        html += '</div>'; // itin-day-preview
      }
      
      html += '</div>'; // itin-section
    }
  }

  return html;
}

function renderPrepTab() {
  const s = itineraryState;
  const hasContent = s.reminders.length > 0 || s.exchangeRates.length > 0 ||
                     s.specialRequests.length > 0 ||
                     s.webSearchSummaries.some(w => /签证|visa|入境|护照/i.test(w.query));

  if (!hasContent) {
    return `<div class="tab-empty">
      <span class="tab-empty-icon">✈️</span>
      <p>行前准备信息将在行程规划后期汇总到这里</p>
    </div>`;
  }

  let html = '';

  // 签证信息（从 webSearchSummaries 筛选）
  const visaSearches = s.webSearchSummaries.filter(w => /签证|visa|入境|护照|免签/i.test(w.query));
  if (visaSearches.length > 0) {
    html += '<div class="tab-content-section"><div class="tab-section-label">🛂 签证信息</div>';
    for (const v of visaSearches) {
      html += `<div class="prep-card">
        <div class="prep-card-title">${escItinHtml(v.query)}</div>
        <div class="prep-card-body">${escItinHtml(v.summary)}</div>
      </div>`;
    }
    html += '</div>';
  }

  // 汇率
  if (s.exchangeRates.length > 0) {
    html += '<div class="tab-content-section"><div class="tab-section-label">💱 汇率</div>';
    for (const r of s.exchangeRates) {
      html += `<div class="rate-card">
        1 ${escItinHtml(r.from)} = ${r.rate} ${escItinHtml(r.to)}
        <small>${r.last_updated ? escItinHtml(r.last_updated) : ''}</small>
      </div>`;
    }
    html += '</div>';
  }

  // 特殊需求
  if (s.specialRequests.length > 0) {
    html += '<div class="tab-content-section"><div class="tab-section-label">⚠️ 特殊需求</div>';
    for (const req of s.specialRequests) {
      html += `<div class="prep-card">
        <div class="prep-card-title">${escItinHtml(req.type || '需求')}</div>
        <div class="prep-card-body">${escItinHtml(req.value)}</div>
      </div>`;
    }
    html += '</div>';
  }

  // 提醒 checklist
  if (s.reminders.length > 0) {
    html += '<div class="tab-content-section"><div class="tab-section-label">📝 行前清单</div>';
    html += '<ul class="reminder-list">';
    for (let i = 0; i < s.reminders.length; i++) {
      html += `<li class="reminder-item">
        <span class="reminder-check" onclick="toggleReminder(this)"></span>
        <span>${escItinHtml(s.reminders[i])}</span>
      </li>`;
    }
    html += '</ul></div>';
  }

  return html;
}

// ============================================================
// Tab 3: 交通安排
// ============================================================
function renderTransportTab() {
  const s = itineraryState;
  const transportSegs = extractSegmentsByType(['transport', 'flight']);
  const hasContent = s.flights.length > 0 || transportSegs.length > 0 || (s.route && s.route.length > 1);

  if (!hasContent) {
    return `<div class="tab-empty">
      <span class="tab-empty-icon">🚄</span>
      <p>机票查询和交通安排信息将显示在这里</p>
    </div>`;
  }

  let html = '';

  // 路线概览
  if (s.route && s.route.length > 1) {
    const stops = s.route.map((city, i) => {
      const isLast = i === s.route.length - 1;
      return `<span class="route-stop">${escItinHtml(city)}</span>${isLast ? '' : '<span class="route-arrow">→</span>'}`;
    }).join('');
    html += `<div class="tab-content-section">
      <div class="tab-section-label">🗺️ 路线</div>
      <div class="itin-route-bar" style="padding-left:0">${stops}</div>
    </div>`;
  }

  // 机票报价
  if (s.flights.length > 0) {
    html += '<div class="tab-content-section"><div class="tab-section-label">✈️ 机票</div>';
    s.flights.forEach(f => {
      html += `<div class="itin-booking-card" style="margin-left:0;margin-right:0">
        <div class="itin-booking-title">${escItinHtml(f.route || '')}</div>
        <div class="itin-booking-detail">
          ${f.airline ? escItinHtml(f.airline) + ' · ' : ''}${f.price ? escItinHtml(f.price) : ''}${f.time ? ' · ' + escItinHtml(f.time) : ''}
        </div>
      </div>`;
    });
    html += '</div>';
  }

  // 市内交通段
  if (transportSegs.length > 0) {
    html += '<div class="tab-content-section"><div class="tab-section-label">🚌 市内交通</div>';
    html += renderExtractedSegments(transportSegs, '🚌', '').replace('<div class="tab-content-section">', '').replace(/<\/div>$/, '');
    html += '</div>';
  }

  return html;
}

// ============================================================
// Tab 4: 住宿
// ============================================================
function renderHotelTab() {
  const s = itineraryState;
  const hotelSegs = extractSegmentsByType(['hotel']);

  if (s.hotels.length === 0 && hotelSegs.length === 0) {
    return `<div class="tab-empty">
      <span class="tab-empty-icon">🏨</span>
      <p>酒店推荐信息将显示在这里</p>
    </div>`;
  }

  let html = '';

  // 酒店报价（按城市分组）
  if (s.hotels.length > 0) {
    const byCity = {};
    s.hotels.forEach(h => {
      const city = h.city || '其他';
      if (!byCity[city]) byCity[city] = [];
      byCity[city].push(h);
    });

    for (const [city, hotelList] of Object.entries(byCity)) {
      html += `<div class="tab-content-section"><div class="tab-section-label">📍 ${escItinHtml(city)}</div>`;
      hotelList.forEach(h => {
        html += `<div class="itin-booking-card" style="margin-left:0;margin-right:0">
          <div class="itin-booking-title">${escItinHtml(h.name || '')}</div>
          <div class="itin-booking-detail">
            ${h.nights ? h.nights + '晚 · ' : ''}${h.price ? escItinHtml(h.price) : ''}
          </div>
        </div>`;
      });
      html += '</div>';
    }
  }

  // 行程中的住宿段
  if (hotelSegs.length > 0) {
    html += '<div class="tab-content-section"><div class="tab-section-label">🛏️ 行程中住宿安排</div>';
    for (const g of hotelSegs) {
      for (const seg of g.segments) {
        const metaParts = [];
        if (seg.location) metaParts.push('📍 ' + escItinHtml(seg.location));
        if (seg.notes) metaParts.push(escItinHtml(seg.notes));
        html += `<div class="segment-extract-card">
          <div class="segment-extract-title">Day ${g.day} · ${escItinHtml(seg.title)}</div>
          ${metaParts.length > 0 ? `<div class="segment-extract-meta">${metaParts.join(' · ')}</div>` : ''}
        </div>`;
      }
    }
    html += '</div>';
  }

  return html;
}

// ============================================================
// Tab 5: 餐饮
// ============================================================
function renderFoodTab() {
  const groups = extractSegmentsByType(['meal', 'food', 'restaurant']);
  return renderExtractedSegments(groups, '🍜', '餐饮推荐将在每日行程中规划后显示在这里');
}

// ============================================================
// Tab 6: 景点活动
// ============================================================
function renderAttractionTab() {
  const groups = extractSegmentsByType(['attraction', 'activity', 'sightseeing']);
  return renderExtractedSegments(groups, '📍', '景点和活动信息将在每日行程中规划后显示在这里');
}

// ============================================================
// Tab 7: 预算
// ============================================================
function renderBudgetTab() {
  const s = itineraryState;

  if (!s.budgetSummary) {
    // 即使没有汇总，也展示已知花费
    let html = '';
    if (s.budget) {
      html += `<div class="tab-content-section">
        <div class="tab-section-label">💰 预算目标</div>
        <div class="prep-card"><div class="prep-card-body" style="font-size:14px;color:#93c5fd">${escItinHtml(s.budget)}</div></div>
      </div>`;
    }
    if (s.flights.length > 0 || s.hotels.length > 0) {
      html += '<div class="tab-content-section"><div class="tab-section-label">📋 已知花费</div>';
      if (s.flights.length > 0) {
        s.flights.forEach(f => {
          if (f.price) html += `<div class="budget-item" style="padding:3px 0"><span class="budget-label">✈️ ${escItinHtml(f.route || '机票')}</span><span class="budget-amount">${escItinHtml(f.price)}</span></div>`;
        });
      }
      if (s.hotels.length > 0) {
        s.hotels.forEach(h => {
          if (h.price) html += `<div class="budget-item" style="padding:3px 0"><span class="budget-label">🏨 ${escItinHtml(h.name || '酒店')}</span><span class="budget-amount">${escItinHtml(h.price)}</span></div>`;
        });
      }
      html += '</div>';
    }

    if (!html) {
      return `<div class="tab-empty">
        <span class="tab-empty-icon">💰</span>
        <p>预算汇总将在行程规划完成后显示</p>
      </div>`;
    }
    return html;
  }

  return renderBudgetSummary(s.budgetSummary);
}

// ============================================================
// Tab 8: 完整行程表
// ============================================================
function renderItineraryTab() {
  const s = itineraryState;
  if (!s.daysPlan || s.daysPlan.length === 0) {
    return `<div class="tab-empty">
      <span class="tab-empty-icon">📅</span>
      <p>完整每日行程将在规划后显示在这里</p>
    </div>`;
  }
  return renderDaysPlan(s.daysPlan);
}

// ============================================================
// Tab 9: 重要信息
// ============================================================
function renderInfoTab() {
  const s = itineraryState;
  const weatherItems = s.weatherList || (s.weather ? [s.weather] : []);
  const infoSearches = s.webSearchSummaries.filter(w => !/签证|visa|入境|护照|免签/i.test(w.query));
  const hasContent = weatherItems.length > 0 || infoSearches.length > 0 || s.reminders.length > 0;

  if (!hasContent) {
    return `<div class="tab-empty">
      <span class="tab-empty-icon">ℹ️</span>
      <p>天气、实用信息等将在查询后显示在这里</p>
    </div>`;
  }

  let html = '';

  // 天气
  if (weatherItems.length > 0) {
    html += '<div class="tab-content-section"><div class="tab-section-label">🌤️ 天气预报</div>';
    for (const w of weatherItems) {
      const desc = w.description ? translateWeather(w.description) : '';
      const cityName = translateCity(w.city);
      html += `<div class="prep-card">
        <div class="prep-card-title">📍 ${escItinHtml(cityName)}</div>
        <div class="prep-card-body">${w.temp_c}°C${desc ? '，' + escItinHtml(desc) : ''}</div>
      </div>`;
    }
    html += '</div>';
  }

  // 搜索信息（排除签证类，那些在行前准备 Tab）
  if (infoSearches.length > 0) {
    html += '<div class="tab-content-section"><div class="tab-section-label">🔍 实用信息</div>';
    for (const info of infoSearches) {
      html += `<div class="info-card">
        <div class="info-card-title">${escItinHtml(info.query)}</div>
        <div class="info-card-body">${escItinHtml(info.summary)}</div>
      </div>`;
    }
    html += '</div>';
  }

  // 提醒
  if (s.reminders.length > 0) {
    html += '<div class="tab-content-section"><div class="tab-section-label">📝 注意事项</div>';
    html += '<ul class="reminder-list">';
    for (const r of s.reminders) {
      html += `<li class="reminder-item">
        <span class="reminder-check" onclick="toggleReminder(this)"></span>
        <span>${escItinHtml(r)}</span>
      </li>`;
    }
    html += '</ul></div>';
  }

  return html;
}

// ============================================================
// Inline 编辑（总览 Tab）
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
    renderCurrentTab();
  };

  input.addEventListener('blur', commitEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { renderCurrentTab(); }
  });
}

// ============================================================
// 提醒 checklist 交互
// ============================================================
function toggleReminder(el) {
  el.classList.toggle('checked');
  el.textContent = el.classList.contains('checked') ? '✓' : '';
}

// ============================================================
// 折叠/展开每日行程（完整行程 Tab）
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
  renderCurrentTab();
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
