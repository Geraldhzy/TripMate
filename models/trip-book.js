/**
 * TripBook — 行程参考书
 *
 * 一次行程规划会话的 single source of truth，分 4 层管理数据：
 *   Layer 1: 静态知识 (StaticKnowledge) — 国家/目的地背景，跨行程复用（按 key 引用）
 *   Layer 2: 动态数据 (DynamicData)     — 天气/汇率/机票酒店报价，带 TTL
 *   Layer 3: 用户约束 (UserConstraints) — 用户确认的需求参数
 *   Layer 4: 结构化行程 (Itinerary)     — AI 逐步构建的行程方案
 */

const PHASE_LABELS = [
  '',            // 0 — 未开始
  '锁定约束',    // 1
  '大交通确认',  // 2
  '行程规划',    // 3（含住宿确认子流程）
  '每日详情',    // 4
  '行程总结',    // 5（含预算汇总）
];

// ── 计数器，用于生成报价 ID ──
let quoteCounter = 0;

class TripBook {
  constructor(id) {
    this.id = id || `trip_${Date.now()}`;
    this.created_at = Date.now();

    // Layer 1: 引用静态知识（不拷贝，存 key 列表）
    this.knowledgeRefs = [];   // ["日本", "泰国"]
    this.activityRefs = [];    // ["潜水"]

    // Layer 2: 动态数据
    this.dynamic = {
      weather: {},          // { "tokyo": { city, current, forecast, _meta } }
      exchangeRates: {},    // { "JPY_CNY": { from, to, rate, last_updated, _meta } }
      flightQuotes: [],     // [{ id, route, date, airline, price_usd, price_cny, ... }]
      hotelQuotes: [],      // [{ id, name, city, checkin, checkout, ... }]
      webSearches: [],      // [{ query, summary, fetched_at }]
    };

    // Layer 3: 用户约束
    this.constraints = {
      destination:   null,  // { value, cities[], confirmed, confirmed_at }
      departCity:    null,  // { value, airports[], confirmed, confirmed_at }
      dates:         null,  // { start, end, days, flexible, confirmed, confirmed_at }
      people:        null,  // { count, details, confirmed, confirmed_at }
      budget:        null,  // { value, per_person, currency, confirmed, confirmed_at }
      preferences:   null,  // { tags[], notes, confirmed, confirmed_at }
      specialRequests: [],  // [{ type, value, confirmed }]
      _history: [],         // [{ field, from, to, changed_at, reason }]
    };

    // Layer 4: 结构化行程
    this.itinerary = {
      phase: 0,
      phaseLabel: '',
      route: [],            // ["东京", "京都", "大阪"]
      days: [],             // [{ day, date, city, title, segments[] }]
      budgetSummary: null,  // { flights, hotels, ..., total_cny, budget_cny, remaining_cny }
      reminders: [],        // ["出发前3天完成Visit Japan Web注册", ...]
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 1: 静态知识引用
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  addKnowledgeRef(key) {
    if (key && !this.knowledgeRefs.includes(key)) {
      this.knowledgeRefs.push(key);
    }
  }

  addActivityRef(key) {
    if (key && !this.activityRefs.includes(key)) {
      this.activityRefs.push(key);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 2: 动态数据
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 记录天气查询结果（从 weather.js 缓存同步） */
  setWeather(cityKey, data) {
    this.dynamic.weather[cityKey.toLowerCase()] = data;
  }

  /** 记录汇率查询结果（从 exchange-rate.js 缓存同步） */
  setExchangeRate(key, data) {
    this.dynamic.exchangeRates[key] = data;
  }

  /** 添加机票报价快照 */
  addFlightQuote(quote) {
    const id = `f${++quoteCounter}`;
    const entry = { id, status: 'quoted', queried_at: Date.now(), ...quote };
    this.dynamic.flightQuotes.push(entry);
    return id;
  }

  /** 添加酒店报价快照 */
  addHotelQuote(quote) {
    const id = `h${++quoteCounter}`;
    const entry = { id, status: 'quoted', queried_at: Date.now(), ...quote };
    this.dynamic.hotelQuotes.push(entry);
    return id;
  }

  /** 记录 web_search 查询（按 query 去重，避免 LLM 重复搜索相同主题） */
  addWebSearch(entry) {
    const key = (entry.query || '').toLowerCase().trim();
    if (!key) return;
    const idx = this.dynamic.webSearches.findIndex(
      s => (s.query || '').toLowerCase().trim() === key
    );
    const record = { ...entry, fetched_at: Date.now() };
    if (idx >= 0) {
      this.dynamic.webSearches[idx] = record;
    } else {
      this.dynamic.webSearches.push(record);
    }
  }

  /** 更新报价状态（quoted → selected → booked） */
  updateQuoteStatus(quoteId, status) {
    const allQuotes = [...this.dynamic.flightQuotes, ...this.dynamic.hotelQuotes];
    const q = allQuotes.find(x => x.id === quoteId);
    if (q) q.status = status;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 3: 用户约束
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 增量更新约束 — AI 调用 update_trip_info 时传入 constraints 对象
   * @param {Object} delta — 与 this.constraints 相同结构的子集
   */
  updateConstraints(delta) {
    if (!delta) return;
    const now = Date.now();
    const fields = ['destination', 'departCity', 'dates', 'people', 'budget', 'preferences'];

    for (const field of fields) {
      if (delta[field] !== undefined) {
        const oldVal = this.constraints[field];
        const newVal = { ...delta[field] };
        
        // ⚠️  CRITICAL: Ensure confirmed flag is set when LLM provides constraint data
        // When AI calls update_trip_info with confirmed: true, set confirmed_at timestamp
        // If confirmed flag is missing/undefined, default to true (assuming AI confirmation means commitment)
        // If explicitly false, preserve it (for pending/tentative constraints)
        if (newVal.confirmed === undefined) {
          newVal.confirmed = true; // Default: treat new constraints as confirmed
        }
        if (newVal.confirmed && !newVal.confirmed_at) {
          newVal.confirmed_at = now;
        }
        // 记录变更历史
        if (oldVal && oldVal.value !== undefined && newVal.value !== undefined && oldVal.value !== newVal.value) {
          this.constraints._history.push({
            field, from: oldVal.value, to: newVal.value,
            changed_at: now, reason: newVal._reason || '用户修改',
          });
        }
        delete newVal._reason;
        // 浅合并：保留旧有子字段，用新值覆盖（避免部分更新导致丢字段）
        this.constraints[field] = oldVal ? { ...oldVal, ...newVal } : newVal;
      }
    }

    // 特殊需求（追加模式）
    if (Array.isArray(delta.specialRequests)) {
      for (const req of delta.specialRequests) {
        const existing = this.constraints.specialRequests.find(
          r => r.type === req.type && r.value === req.value
        );
        if (existing) {
          existing.confirmed = req.confirmed;
        } else {
          this.constraints.specialRequests.push(req);
        }
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 4: 结构化行程
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 更新行程阶段
   */
  updatePhase(phase) {
    if (typeof phase === 'number' && phase >= 0 && phase <= 7) {
      this.itinerary.phase = phase;
      this.itinerary.phaseLabel = PHASE_LABELS[phase] || '';
    }
  }

  /**
   * 增量更新行程数据
   * @param {Object} delta — { route?, days?, budgetSummary?, reminders? }
   */
  updateItinerary(delta) {
    if (!delta) return;

    if (delta.phase !== undefined) {
      this.updatePhase(delta.phase);
    }

    if (Array.isArray(delta.route) && delta.route.length > 0) {
      this.itinerary.route = delta.route;
    }

    if (Array.isArray(delta.days)) {
      // 合并策略：按 day 编号覆盖，但保留已有 segments（除非新数据明确提供了非空 segments）
      for (const newDay of delta.days) {
        const idx = this.itinerary.days.findIndex(d => d.day === newDay.day);
        if (idx >= 0) {
          const existing = this.itinerary.days[idx];
          // 如果新数据的 segments 为空数组或未提供，保留已有 segments
          const merged = { ...existing, ...newDay };
          if (existing.segments?.length > 0 && (!newDay.segments || newDay.segments.length === 0)) {
            merged.segments = existing.segments;
          }
          this.itinerary.days[idx] = merged;
        } else {
          this.itinerary.days.push(newDay);
        }
      }
      // 按 day 编号排序
      this.itinerary.days.sort((a, b) => a.day - b.day);
    }

    if (delta.budgetSummary) {
      this.itinerary.budgetSummary = { ...this.itinerary.budgetSummary, ...delta.budgetSummary };
    }

    if (Array.isArray(delta.reminders)) {
      const existing = new Set(this.itinerary.reminders);
      delta.reminders.forEach(r => existing.add(r));
      this.itinerary.reminders = Array.from(existing);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 系统提示注入
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 生成"已确认用户约束"文本，注入系统提示告知 AI 不要重复询问
   */
  /**
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * buildConstraintsPromptSection() - 系统提示约束注入
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * 
   * 这个方法是 TripBook → 系统提示注入的关键链接。
   * 
   * SPLIT LOGIC (第 257/263/272/277/285/291 行):
   *   const confirmed = [];  // 已确认信息（constraint.confirmed === true）
   *   const pending = [];    // 待确认信息（constraint.confirmed !== true）
   * 
   *   if (constraint.confirmed) {
   *     confirmed.push(`${label} ✅`);
   *   } else {
   *     pending.push(`${label} ❓`);
   *   }
   * 
   * OUTPUT FORMAT (第 300-305 行):
   *   ## 用户已确认信息（勿重复询问）
   *   - 目的地：日本 ✅
   *   - 出发城市：北京 ✅
   *   - 日期：2026-05-01 ~ 2026-05-07（7天）✅
   *   
   *   ## 待确认信息
   *   - 预算：❓
   * 
   * CRITICAL DEPENDENCY:
   *   如果 constraint.confirmed === undefined，会进入 pending 列表
   *   system-prompt.js line 66: "严禁重复询问" 规则对应已确认信息
   *   如果已确认列表为空 → 规则无法生效 → AI 重新提问
   * 
   * FIX (models/trip-book.js line 154-156):
   *   if (newVal.confirmed === undefined) {
   *     newVal.confirmed = true;  // 默认设为已确认
   *   }
   * 
   * DEBUGGING:
   *   1. 检查约束对象的 confirmed 字段值：true/false/undefined
   *   2. 查看系统提示是否包含"用户已确认信息"部分
   *   3. 如果信息在 confirmed 但系统提示中仍然缺失，说明恢复失败
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   */
  buildConstraintsPromptSection() {
    const c = this.constraints;
    const confirmed = [];
    const pending = [];

    if (c.destination) {
      const cities = c.destination.cities?.length
        ? `（${c.destination.cities.join('·')}）` : '';
      const line = `目的地：${c.destination.value || ''}${cities}`;
      (c.destination.confirmed ? confirmed : pending).push(line);
    }
    if (c.departCity) {
      const airports = c.departCity.airports?.length
        ? `（可用机场：${c.departCity.airports.join('/')}）` : '';
      const line = `出发城市：${c.departCity.value || ''}${airports}`;
      (c.departCity.confirmed ? confirmed : pending).push(line);
    }
    if (c.dates) {
      const days = c.dates.days ? `（${c.dates.days}天）` : '';
      const flex = c.dates.flexible ? '（日期灵活）' : '';
      const notes = c.dates.notes ? `（${c.dates.notes}）` : '';
      const line = c.dates.start
        ? `日期：${c.dates.start} ~ ${c.dates.end}${days}${flex}${notes}`
        : `天数：${c.dates.days || '待定'}天${flex}${notes}`;
      (c.dates.confirmed ? confirmed : pending).push(line);
    }
    if (c.people) {
      const detail = c.people.details ? `（${c.people.details}）` : '';
      const line = `人数：${c.people.count}人${detail}`;
      (c.people.confirmed ? confirmed : pending).push(line);
    }
    if (c.budget) {
      const pp = c.budget.per_person ? '人均' : '总预算';
      const curr = c.budget.currency && c.budget.currency !== 'CNY' ? ` ${c.budget.currency}` : '';
      const scope = c.budget.scope ? `，${c.budget.scope}` : '';
      const notes = c.budget.notes ? `（${c.budget.notes}）` : '';
      const line = `预算：${c.budget.value}${curr}（${pp}${scope}）${notes}`;
      (c.budget.confirmed ? confirmed : pending).push(line);
    }
    if (c.preferences && (c.preferences.tags?.length || c.preferences.notes)) {
      const tagsStr = c.preferences.tags?.length ? c.preferences.tags.join('、') : '';
      const notesStr = c.preferences.notes ? `（${c.preferences.notes}）` : '';
      const line = `偏好：${tagsStr}${notesStr}`;
      (c.preferences.confirmed ? confirmed : pending).push(line);
    }
    for (const req of c.specialRequests) {
      const line = `${req.type}：${req.value}`;
      (req.confirmed ? confirmed : pending).push(line);
    }

    const parts = [];
    if (confirmed.length > 0) {
      parts.push(`## 用户已确认信息（勿重复询问）\n${confirmed.map(l => `- ${l} ✅`).join('\n')}`);
    }
    if (pending.length > 0) {
      parts.push(`## 待确认信息\n${pending.map(l => `- ${l} ❓`).join('\n')}`);
    }
    return parts.join('\n\n');
  }

  /**
   * 生成"当前行程进度"文本
   */
  buildItineraryPromptSection() {
    const it = this.itinerary;
    if (it.phase === 0) return '';

    const parts = [];
    parts.push(`## 当前行程进度`);
    parts.push(`阶段 ${it.phase}/7: ${it.phaseLabel}`);

    if (it.route.length > 0) {
      parts.push(`路线: ${it.route.join(' → ')}`);
    }

    // 已选择的机票/酒店
    const selectedFlights = this.dynamic.flightQuotes.filter(f => f.status === 'selected');
    for (const f of selectedFlights) {
      const price = f.price_cny ? `¥${f.price_cny}` : `$${f.price_usd}`;
      parts.push(`已选机票: ${f.airline || ''} ${f.route} ${price}/人`);
    }
    const selectedHotels = this.dynamic.hotelQuotes.filter(h => h.status === 'selected');
    for (const h of selectedHotels) {
      const price = h.price_total_cny ? `¥${h.price_total_cny}` : `$${h.price_per_night_usd}/晚`;
      parts.push(`已选酒店: ${h.name} ${h.city} ${price}`);
    }

    // 预算摘要
    if (it.budgetSummary && it.budgetSummary.total_cny) {
      parts.push(`预算使用: ¥${it.budgetSummary.total_cny} / ¥${it.budgetSummary.budget_cny || '?'}`);
    }

    return parts.join('\n');
  }

  /**
   * 生成动态数据缓存提示（天气、汇率）
   */
  buildDynamicDataPromptSection() {
    const parts = [];
    const now = Date.now();

    // 天气
    const weatherLines = [];
    for (const [, w] of Object.entries(this.dynamic.weather)) {
      if (w._meta && w._meta.fetched_at) {
        const age = Math.round((now - w._meta.fetched_at) / 60000);
        const ttl = Math.round((w._meta.ttl || 3 * 3600000) / 60000);
        if (age < ttl) {
          const desc = w.current?.description ? `，${w.current.description}` : '';
          weatherLines.push(`- ${w.city}: ${w.current?.temp_c || '?'}°C${desc}（${age}分钟前查询，${ttl - age}分钟后过期）`);
        }
      }
    }
    if (weatherLines.length > 0) {
      parts.push(`### 已缓存天气（勿重复调用 get_weather）\n${weatherLines.join('\n')}`);
    }

    // 汇率
    const rateLines = [];
    for (const [, r] of Object.entries(this.dynamic.exchangeRates)) {
      if (r._meta && r._meta.fetched_at) {
        const age = Math.round((now - r._meta.fetched_at) / 60000);
        const ttl = Math.round((r._meta.ttl || 4 * 3600000) / 60000);
        if (age < ttl) {
          rateLines.push(`- 1 ${r.from} = ${r.rate} ${r.to}（${age}分钟前查询）`);
        }
      }
    }
    if (rateLines.length > 0) {
      parts.push(`### 已缓存汇率（勿重复调用 get_exchange_rate）\n${rateLines.join('\n')}`);
    }

    // 已完成的搜索
    const searchLines = [];
    for (const s of this.dynamic.webSearches) {
      const age = Math.round((now - s.fetched_at) / 60000);
      const summary = s.summary || s.query;
      searchLines.push(`- "${s.query}" → ${summary}（${age}分钟前）`);
    }
    if (searchLines.length > 0) {
      parts.push(`### 已完成的搜索（勿重复搜索相同或相似主题）\n以下主题已通过 web_search 查询过，请直接使用对话中的结果，不要再次搜索相同或高度相似的内容：\n${searchLines.join('\n')}`);
    }

    return parts.length > 0 ? `## 已缓存动态数据\n${parts.join('\n\n')}` : '';
  }

  /**
   * 生成完整的 TripBook 系统提示注入段
   */
  toSystemPromptSection() {
    const sections = [];
    sections.push('# 行程参考书');

    // 动态数据
    const dynamicSection = this.buildDynamicDataPromptSection();
    if (dynamicSection) sections.push(dynamicSection);

    // 用户约束
    const constraintsSection = this.buildConstraintsPromptSection();
    if (constraintsSection) sections.push(constraintsSection);

    // 行程进度
    const itinerarySection = this.buildItineraryPromptSection();
    if (itinerarySection) sections.push(itinerarySection);

    // 如果只有标题，说明还没开始
    if (sections.length === 1) {
      sections.push('（尚未开始规划，等待用户输入）');
    }

    return sections.join('\n\n');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 面板数据导出
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 导出供前端面板渲染的扁平数据
   * 保持与现有 itineraryState 兼容的字段名
   */
  toPanelData() {
    const c = this.constraints;
    const it = this.itinerary;

    const dest = c.destination;
    // 目的地字符串：如果 value 已包含城市信息（有括号），不再重复拼接 cities
    let destStr = '';
    if (dest) {
      const base = dest.value || '';
      if (dest.cities?.length && !/[（(]/.test(base)) {
        destStr = `${base}（${dest.cities.join('·')}）`;
      } else {
        destStr = base;
      }
    }

    // 所有目的地天气
    const weatherEntries = Object.values(this.dynamic.weather);
    const weatherList = weatherEntries.map(w => ({
      city: w.city,
      temp_c: w.current?.temp_c,
      description: w.current?.description,
    }));

    return {
      destination: destStr,
      departCity: c.departCity?.value || '',
      dates: c.dates ? (c.dates.start ? `${c.dates.start} ~ ${c.dates.end}` : '') : '',
      days: c.dates?.days || 0,
      people: c.people?.count || 0,
      budget: c.budget?.value || '',
      preferences: c.preferences?.tags || [],
      phase: it.phase,
      phaseLabel: it.phaseLabel,
      route: it.route,
      flights: this.dynamic.flightQuotes.filter(f => f.status !== 'quoted' || this.dynamic.flightQuotes.length <= 5)
        .map(f => ({
          route: f.route, airline: f.airline,
          price: f.price_cny ? `¥${f.price_cny}` : `$${f.price_usd}`,
          time: f.duration, status: f.status,
        })),
      hotels: this.dynamic.hotelQuotes.filter(h => h.status !== 'quoted' || this.dynamic.hotelQuotes.length <= 5)
        .map(h => ({
          name: h.name, city: h.city,
          price: h.price_total_cny ? `¥${h.price_total_cny}` : `$${h.price_per_night_usd}/晚`,
          nights: h.nights, status: h.status,
        })),
      weather: weatherList.length === 1 ? weatherList[0] : null,  // 单城市保持向后兼容
      weatherList: weatherList.length > 0 ? weatherList : null,   // 多城市天气列表
      budgetSummary: it.budgetSummary,
      daysPlan: it.days.map(d => ({
        day: d.day, date: d.date, city: d.city, title: d.title,
        segments: (d.segments || []).map(seg => ({
          time: seg.time || '',
          title: seg.title || seg.activity || '',
          location: seg.location || '',
          duration: seg.duration || '',
          transport: seg.transport || '',
          transportTime: seg.transportTime || '',
          notes: seg.notes || '',
          type: seg.type || 'activity',
        })),
      })),

      // 行前准备 & 重要信息 Tab
      reminders: it.reminders || [],
      exchangeRates: Object.values(this.dynamic.exchangeRates).map(r => ({
        from: r.from, to: r.to, rate: r.rate, last_updated: r.last_updated,
      })),
      webSearchSummaries: this.dynamic.webSearches.map(s => ({
        query: s.query, summary: s.summary || '', fetched_at: s.fetched_at,
      })),
      specialRequests: (c.specialRequests || []).map(r => ({
        type: r.type, value: r.value, confirmed: r.confirmed,
      })),
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 序列化
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  toJSON() {
    return {
      id: this.id,
      created_at: this.created_at,
      knowledgeRefs: this.knowledgeRefs,
      activityRefs: this.activityRefs,
      dynamic: this.dynamic,
      constraints: this.constraints,
      itinerary: this.itinerary,
    };
  }

  static fromJSON(json) {
    const tb = new TripBook(json.id);
    tb.created_at = json.created_at || Date.now();
    tb.knowledgeRefs = json.knowledgeRefs || [];
    tb.activityRefs = json.activityRefs || [];
    tb.dynamic = { ...tb.dynamic, ...json.dynamic };
    tb.constraints = { ...tb.constraints, ...json.constraints };
    tb.itinerary = { ...tb.itinerary, ...json.itinerary };
    return tb;
  }
}

module.exports = { TripBook, PHASE_LABELS };
