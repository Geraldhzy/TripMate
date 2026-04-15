/**
 * TripBook — 行程参考书
 *
 * 一次行程规划会话的 single source of truth，分 3 层管理数据：
 *   Layer 1: 动态数据 (DynamicData)     — 报价/搜索缓存
 *   Layer 2: 用户约束 (UserConstraints) — 用户确认的需求参数
 *   Layer 3: 结构化行程 (Itinerary)     — AI 逐步构建的行程方案
 */

const PHASE_LABELS = [
  '',            // 0 — 未开始
  '了解需求',    // 1 — 了解用户需求 + 锁定硬性约束
  '规划框架',    // 2 — 大交通 + 行程框架
  '完善详情',    // 3 — 填充景点/餐饮/住宿
  '行程总结',    // 4 — 预算汇总
];

let quoteCounter = 0;

class TripBook {
  constructor(id) {
    this.id = id || `trip_${Date.now()}`;
    this.created_at = Date.now();

    // Layer 1: 动态数据
    this.dynamic = {
      flightQuotes: [],     // [{ id, route, date, airline, price_usd, price_cny, ... }]
      hotelQuotes: [],      // [{ id, name, city, checkin, checkout, ... }]
      webSearches: [],      // [{ query, summary, fetched_at }]
    };

    // Layer 2: 用户约束
    this.constraints = {
      destination:   null,  // { value, cities[], confirmed, confirmed_at }
      departCity:    null,  // { value, airports[], confirmed, confirmed_at }
      dates:         null,  // { start, end, days, flexible, confirmed, confirmed_at }
      people:        null,  // { count, details, confirmed, confirmed_at }
      budget:        null,  // { value, per_person, currency, confirmed, confirmed_at }
      preferences:   null,  // { tags[], notes, confirmed, confirmed_at }
      specialRequests: [],  // [{ type, value, confirmed }]
    };

    // Layer 3: 结构化行程
    this.itinerary = {
      phase: 0,
      phaseLabel: '',
      route: [],            // ["东京", "京都", "大阪"]
      days: [],             // [{ day, date, city, title, segments[] }]
      budgetSummary: null,  // { flights, hotels, ..., total_cny, budget_cny, remaining_cny }
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 1: 动态数据
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  addFlightQuote(quote) {
    const id = `f${++quoteCounter}`;
    const entry = { id, status: 'quoted', queried_at: Date.now(), ...quote };
    this.dynamic.flightQuotes.push(entry);
    return id;
  }

  addHotelQuote(quote) {
    const id = `h${++quoteCounter}`;
    const entry = { id, status: 'quoted', queried_at: Date.now(), ...quote };
    this.dynamic.hotelQuotes.push(entry);
    return id;
  }

  /** 记录 web_search 查询（按 query 去重） */
  addWebSearch(entry) {
    const key = (entry.query || '').toLowerCase().trim();
    if (!key) return;
    const idx = this.dynamic.webSearches.findIndex(
      s => (s.query || '').toLowerCase().trim() === key
    );
    const record = { ...entry, fetched_at: Date.now() };
    if (idx >= 0) {
      const existing = this.itinerary.days[idx];
      if (process.env.DEBUG_MERGE) {
        const existingTitles = existing.segments?.map(s => `${s.time}|${s.title || s.activity || '?'}`) || [];
        const newTitles = newDay.segments?.map(s => `${s.time}|${s.title || s.activity || '?'}`) || [];
        console.log(`[MERGE] Day ${newDay.day}:`, { existingCount: existingTitles.length, newCount: newTitles.length, existingTitles, newTitles, replace: newDay._replace });
      }
      this.dynamic.webSearches[idx] = record;
    } else {
      this.dynamic.webSearches.push(record);
    }
  }

  updateQuoteStatus(quoteId, status) {
    const allQuotes = [...this.dynamic.flightQuotes, ...this.dynamic.hotelQuotes];
    const q = allQuotes.find(x => x.id === quoteId);
    if (q) q.status = status;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Layer 2: 用户约束
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  updateConstraints(delta) {
    if (!delta) return;
    const now = Date.now();
    const fields = ['destination', 'departCity', 'dates', 'people', 'budget', 'preferences'];

    for (const field of fields) {
      if (delta[field] !== undefined) {
        const oldVal = this.constraints[field];
        const newVal = { ...delta[field] };

        if (newVal.confirmed === undefined) {
          newVal.confirmed = true;
        }
        if (newVal.confirmed && !newVal.confirmed_at) {
          newVal.confirmed_at = now;
        }
        delete newVal._reason;
        this.constraints[field] = oldVal ? { ...oldVal, ...newVal } : newVal;
      }
    }

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
  // Layer 3: 结构化行程
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  updatePhase(phase) {
    if (typeof phase === 'number' && phase >= 0 && phase <= 4) {
      this.itinerary.phase = phase;
      this.itinerary.phaseLabel = PHASE_LABELS[phase] || '';
    }
  }

  updateItinerary(delta) {
    if (!delta) return;

    if (delta.phase !== undefined) {
      this.updatePhase(delta.phase);
    }

    if (Array.isArray(delta.route) && delta.route.length > 0) {
      this.itinerary.route = delta.route;
    }

    if (Array.isArray(delta.days)) {
      for (const newDay of delta.days) {
        const idx = this.itinerary.days.findIndex(d => d.day === newDay.day);
        if (idx >= 0) {
          const existing = this.itinerary.days[idx];
          if (process.env.DEBUG_MERGE) {
            const existingTitles = existing.segments?.map(s => `${s.time}|${s.title || s.activity || '?'}`) || [];
            const newTitles = newDay.segments?.map(s => `${s.time}|${s.title || s.activity || '?'}`) || [];
            console.log(`[MERGE] Day ${newDay.day}:`, { existingCount: existingTitles.length, newCount: newTitles.length, existingTitles, newTitles, replace: newDay._replace });
          }
          const merged = { ...existing, ...newDay };

          // segments 智能合并：
          // 1. 新数据没传 segments 或传了空数组 → 保留原有 segments
          // 2. 新数据传了 segments 且设置了 _replace: true → 完全替换
          // 3. 新数据传了 segments（非空）→ 按 time+title 去重合并
          if (!newDay.segments || newDay.segments.length === 0) {
            merged.segments = existing.segments || [];
          } else if (newDay._replace) {
            merged.segments = newDay.segments;
          } else if (existing.segments?.length > 0) {
            // VALIDATION: Check segment data integrity
            if (!Array.isArray(newDay.segments)) {
              console.warn(`[WARN] Invalid segments for day ${newDay.day}: not an array`, newDay.segments);
              merged.segments = existing.segments || [];
            } else {
              // 去重合并：用 time+title 作为唯一标识
              const existingMap = new Map();
              for (const seg of existing.segments) {
                const key = `${seg.time || ''}|${seg.title || seg.activity || ''}`;
                existingMap.set(key, seg);
              }
              for (const seg of newDay.segments) {
                const key = `${seg.time || ''}|${seg.title || seg.activity || ''}`;
                // Validate segment has at least time or title
                if (!key.includes('|') || key === '|') {
                  console.warn(`[WARN] Segment missing time or title for day ${newDay.day}:`, seg);
                }
                existingMap.set(key, { ...(existingMap.get(key) || {}), ...seg });
              }
              merged.segments = Array.from(existingMap.values())
                .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
            }
          }
          delete merged._replace;
          this.itinerary.days[idx] = merged;
        } else {
          const cleaned = { ...newDay };
          delete cleaned._replace;
          this.itinerary.days.push(cleaned);
        }
      }
      this.itinerary.days.sort((a, b) => a.day - b.day);
    }

    if (delta.budgetSummary) {
      this.itinerary.budgetSummary = { ...this.itinerary.budgetSummary, ...delta.budgetSummary };
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 系统提示注入
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
      parts.push(`## 暂按假设推进的信息（用户未明确，已做合理假设，无需追问，用户主动调整时再更新）\n${pending.map(l => `- ${l} ⏳`).join('\n')}`);
    }
    return parts.join('\n\n');
  }

  buildItineraryPromptSection() {
    const it = this.itinerary;
    if (it.phase === 0) return '';

    const parts = [];
    parts.push(`## 当前行程进度`);
    parts.push(`阶段 ${it.phase}/4: ${it.phaseLabel}`);

    if (it.route.length > 0) {
      parts.push(`路线: ${it.route.join(' → ')}`);
    }

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

    if (it.budgetSummary && it.budgetSummary.total_cny) {
      parts.push(`预算使用: ¥${it.budgetSummary.total_cny} / ¥${it.budgetSummary.budget_cny || '?'}`);
    }

    // 注入每日行程摘要（让 LLM 知道已有行程，变更时不会丢失）
    if (it.days.length > 0) {
      parts.push('');
      parts.push('## 已有每日行程（变更时只传需修改的天数，未提及的天保持不变）');
      for (const day of it.days) {
        const segs = day.segments || [];
        if (segs.length === 0) {
          parts.push(`- Day ${day.day}（${day.date || ''}）${day.city || ''} — ${day.title || '待安排'}`);
        } else {
          const segSummary = segs.map(s => {
            const time = s.time ? `${s.time} ` : '';
            return `${time}${s.title || s.activity || ''}`;
          }).join(' → ');
          parts.push(`- Day ${day.day}（${day.date || ''}）${day.city || ''} — ${day.title || ''}: ${segSummary}`);
        }
      }
    }

    return parts.join('\n');
  }

  /** 生成已完成搜索的提示（避免 LLM 重复搜索） */
  buildSearchCachePromptSection() {
    const now = Date.now();
    const searchLines = [];
    for (const s of this.dynamic.webSearches) {
      const age = Math.round((now - s.fetched_at) / 60000);
      const summary = s.summary || s.query;
      searchLines.push(`- "${s.query}" → ${summary}（${age}分钟前）`);
    }
    if (searchLines.length > 0) {
      return `## 已完成的搜索（勿重复搜索相同或相似主题）\n以下主题已通过 web_search 查询过，请直接使用对话中的结果：\n${searchLines.join('\n')}`;
    }
    return '';
  }

  toSystemPromptSection() {
    const sections = [];
    sections.push('# 行程参考书');

    const searchSection = this.buildSearchCachePromptSection();
    if (searchSection) sections.push(searchSection);

    const constraintsSection = this.buildConstraintsPromptSection();
    if (constraintsSection) sections.push(constraintsSection);

    const itinerarySection = this.buildItineraryPromptSection();
    if (itinerarySection) sections.push(itinerarySection);

    if (sections.length === 1) {
      sections.push('（尚未开始规划，等待用户输入）');
    }

    return sections.join('\n\n');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 面板数据导出
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  toPanelData() {
    const c = this.constraints;
    const it = this.itinerary;

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
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 序列化
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  toJSON() {
    return {
      id: this.id,
      created_at: this.created_at,
      dynamic: this.dynamic,
      constraints: this.constraints,
      itinerary: this.itinerary,
    };
  }

  static fromJSON(json) {
    const tb = new TripBook(json.id);
    tb.created_at = json.created_at || Date.now();
    tb.dynamic = { ...tb.dynamic, ...json.dynamic };
    tb.constraints = { ...tb.constraints, ...json.constraints };
    tb.itinerary = { ...tb.itinerary, ...json.itinerary };
    return tb;
  }
}

module.exports = { TripBook, PHASE_LABELS };
