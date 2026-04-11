const express = require('express');
const path = require('path');
const { OpenAI } = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const { getToolDefinitions, executeToolCall, getToolDefinitionsForAnthropic } = require('./tools');
const { buildSystemPrompt } = require('./prompts/system-prompt');
const { getCachedRates } = require('./tools/exchange-rate');
const { getCachedWeather } = require('./tools/weather');
const { TripBook } = require('./models/trip-book');
const { initCache: initDestCache } = require('./tools/dest-knowledge');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// ============================================================
// POST /api/chat — Agent 核心路由（SSE 流式）
// ============================================================
app.post('/api/chat', async (req, res) => {
  const { messages, provider, model, knownRates: bodyRates, knownWeather: bodyWeather, tripBookSnapshot } = req.body;
  const apiKey = req.headers['x-api-key'];
  const baseUrl = req.headers['x-base-url'] || '';

  // 客户端通过 body 传来的已知汇率/天气缓存
  const clientRates = Array.isArray(bodyRates) ? bodyRates : [];
  const clientWeather = Array.isArray(bodyWeather) ? bodyWeather : [];

  if (!apiKey) {
    return res.status(401).json({ error: '请先在设置中配置 API Key' });
  }
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: '消息格式错误' });
  }

  // SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendSSE = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // ── 创建本次请求的 TripBook 实例 ──
    const tripBook = new TripBook();

    // 合并服务端内存缓存 + 客户端缓存的汇率，去重（以 from_to 为 key，服务端优先）
    const now = Date.now();
    const RATE_TTL = 4 * 60 * 60 * 1000;
    const rateMap = new Map();
    // 先加客户端缓存（可能已过期）
    for (const r of clientRates) {
      if (r.fetched_at && (now - r.fetched_at) < RATE_TTL) {
        rateMap.set(`${r.from}_${r.to}`, r);
      }
    }
    // 服务端缓存覆盖（更权威）
    for (const r of getCachedRates()) {
      rateMap.set(`${r.from}_${r.to}`, r);
    }
    const knownRates = Array.from(rateMap.values());

    // 合并天气缓存：客户端 + 服务端
    const WEATHER_TTL = 3 * 60 * 60 * 1000;
    const weatherMap = new Map();
    for (const w of clientWeather) {
      if (w.fetched_at && (now - w.fetched_at) < WEATHER_TTL) {
        weatherMap.set((w.city || '').toLowerCase(), w);
      }
    }
    for (const w of getCachedWeather()) {
      weatherMap.set((w.city || '').toLowerCase(), w);
    }
    const knownWeather = Array.from(weatherMap.values());

    // 将已知汇率同步到 TripBook（汇率是全局有用的）
    for (const r of knownRates) {
      tripBook.setExchangeRate(`${r.from}_${r.to}`, {
        from: r.from, to: r.to, rate: r.rate,
        last_updated: r.last_updated,
        _meta: { fetched_at: r.fetched_at, ttl: RATE_TTL }
      });
    }
    // 注意：不将客户端缓存的天气自动注入 TripBook，避免旧行程天气（如清迈）
    // 污染新行程面板。天气仍通过 knownWeather 注入系统提示防止重复查询，
    // TripBook 天气仅在 AI 本次调用 get_weather 时通过 setWeather 写入。

    // 尝试从客户端传来的 TripBook 快照恢复约束和行程状态
    try {
      if (tripBookSnapshot) {
        if (tripBookSnapshot.constraints) tripBook.updateConstraints(tripBookSnapshot.constraints);
        if (tripBookSnapshot.itinerary) tripBook.updateItinerary(tripBookSnapshot.itinerary);
        if (tripBookSnapshot.knowledgeRefs) {
          for (const ref of tripBookSnapshot.knowledgeRefs) tripBook.addKnowledgeRef(ref);
        }
      }
    } catch {}

    const conversationText = messages.map(m => m.content || '').join(' ');
    const systemPrompt = buildSystemPrompt(conversationText, knownRates, knownWeather, tripBook);

    let fullText = '';
    if (provider === 'anthropic') {
      fullText = await handleAnthropicChat(apiKey, model, systemPrompt, messages, sendSSE, baseUrl, tripBook) || '';
    } else if (provider === 'deepseek') {
      const dsBaseUrl = baseUrl || 'https://api.deepseek.com/v1';
      fullText = await handleOpenAIChat(apiKey, model, systemPrompt, messages, sendSSE, dsBaseUrl, tripBook) || '';
    } else {
      fullText = await handleOpenAIChat(apiKey, model, systemPrompt, messages, sendSSE, baseUrl, tripBook) || '';
    }

    // Quick Replies 检测：从 AI 回复中提取可点击选项
    const quickReplies = extractQuickReplies(fullText, tripBook);
    if (quickReplies.length > 0) {
      sendSSE('quick_replies', { questions: quickReplies });
    }

    sendSSE('done', {});
  } catch (err) {
    console.error('Agent error:', err);
    sendSSE('error', { message: err.message || '未知错误' });
  } finally {
    res.end();
  }
});

// ============================================================
// 工具执行辅助：执行并推送结果，汇率工具额外推送缓存事件
// ============================================================

/** 从工具结果中提取人类可读的简短标签，供前端 done 状态显示 */
function getToolResultLabel(funcName, funcArgs, resultStr) {
  try {
    const data = JSON.parse(resultStr);
    if (data.error) return null; // 出错时不生成标签，让前端显示默认
    switch (funcName) {
      case 'web_search': {
        const count = data.results?.length || 0;
        const q = (funcArgs.query || '').substring(0, 20);
        return `找到 ${count} 条结果：「${q}${funcArgs.query?.length > 20 ? '…' : ''}」`;
      }
      case 'get_weather': {
        if (data.current) {
          const desc = data.current.description ? `，${data.current.description}` : '';
          return `${data.city} 当前 ${data.current.temp_c}°C${desc}`;
        }
        return `${data.city || ''} 天气已获取`;
      }
      case 'get_exchange_rate': {
        if (data.rate) {
          return `1 ${data.from} ≈ ${data.rate} ${data.to}`;
        }
        return null;
      }
      case 'search_poi': {
        const count = Array.isArray(data.results) ? data.results.length : (Array.isArray(data) ? data.length : 0);
        return `找到 ${count} 个地点`;
      }
      case 'cache_destination_knowledge': {
        return `已缓存「${data.destination || ''}」知识库`;
      }
      case 'update_trip_info': {
        return data.message || '已更新行程参考书';
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function runTool(funcName, funcArgs, toolId, sendSSE, tripBook) {
  sendSSE('tool_start', { id: toolId, name: funcName, arguments: funcArgs });
  try {
    const result = await executeToolCall(funcName, funcArgs);
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    const resultLabel = getToolResultLabel(funcName, funcArgs, resultStr);
    sendSSE('tool_result', {
      id: toolId, name: funcName,
      resultLabel  // 可能为 null，前端降级到默认标签
    });

    // ── 将工具结果同步到 TripBook ──
    if (tripBook) {
      try {
        const parsed = JSON.parse(resultStr);

        // 汇率结果 → TripBook + 客户端缓存
        if (funcName === 'get_exchange_rate' && parsed.rate && !parsed.error) {
          sendSSE('rate_cached', parsed);
          tripBook.setExchangeRate(`${parsed.from}_${parsed.to}`, {
            from: parsed.from, to: parsed.to, rate: parsed.rate,
            last_updated: parsed.last_updated,
            _meta: { fetched_at: parsed.fetched_at || Date.now(), ttl: 4 * 3600000 }
          });
        }

        // 天气结果 → TripBook + 客户端缓存
        if (funcName === 'get_weather' && !parsed.error) {
          sendSSE('weather_cached', parsed);
          tripBook.setWeather(parsed.city || '', {
            city: parsed.city, current: parsed.current, forecast: parsed.forecast,
            _meta: { fetched_at: parsed.fetched_at || Date.now(), ttl: 3 * 3600000 }
          });
        }

        // 机票报价 → TripBook
        if (funcName === 'search_flights' && Array.isArray(parsed.flights)) {
          // origin/destination/date 在顶层，不在每条 flight 里
          const route = `${parsed.origin || funcArgs.origin || '?'} → ${parsed.destination || funcArgs.destination || '?'}`;
          const flightDate = parsed.date || funcArgs.date || '';
          for (const f of parsed.flights) {
            tripBook.addFlightQuote({
              route, date: flightDate, airline: f.airline,
              price_usd: f.price_usd,
              duration: f.duration, stops: f.stops,
            });
          }
        }

        // 酒店报价 → TripBook
        if (funcName === 'search_hotels' && Array.isArray(parsed.hotels)) {
          for (const h of parsed.hotels) {
            tripBook.addHotelQuote({
              name: h.name, city: h.city,
              checkin: h.checkin, checkout: h.checkout, nights: h.nights,
              price_per_night_usd: h.price_per_night_usd || h.price_per_night,
              price_total_cny: h.price_total_cny,
              rating: h.rating,
            });
          }
        }

        // 目的地知识 → TripBook 知识引用
        if (funcName === 'cache_destination_knowledge' && parsed.destination) {
          tripBook.addKnowledgeRef(parsed.destination);
        }

        // web_search → TripBook 搜索记录（避免 LLM 重复搜索相同主题）
        if (funcName === 'web_search' && !parsed.error) {
          const query = funcArgs.query || parsed.query || '';
          // 提取首条结果的标题作为摘要
          const firstResult = Array.isArray(parsed.results) && parsed.results[0];
          const summary = firstResult
            ? `找到 ${parsed.results.length} 条结果，首条: ${(firstResult.title || '').slice(0, 60)}`
            : '已搜索';
          tripBook.addWebSearch({ query, summary });
        }

        // update_trip_info → 核心：写入 TripBook 约束/行程/阶段
        if (funcName === 'update_trip_info' && parsed.success && parsed.updates) {
          const updates = parsed.updates;
          if (updates.constraints) {
            tripBook.updateConstraints(updates.constraints);
          }
          if (updates.phase !== undefined) {
            tripBook.updatePhase(updates.phase);
          }
          if (updates.itinerary) {
            tripBook.updateItinerary(updates.itinerary);
          }
          // 推送 TripBook 面板数据到前端（附加完整快照供持久化）
          sendSSE('tripbook_update', {
            ...tripBook.toPanelData(),
            _snapshot: tripBook.toJSON()   // 完整结构化数据，含 constraints/itinerary/dynamic
          });
        }
      } catch {}
    }

    return resultStr;
  } catch (toolErr) {
    const errMsg = `工具 ${funcName} 执行失败: ${toolErr.message}`;
    sendSSE('tool_result', { id: toolId, name: funcName, resultLabel: null });
    return errMsg;
  }
}

// ============================================================
// [已移除] extractItineraryInfo / postProcessTripBook
// 旧版通过正则从 AI 回复中提取行程信息，容易产生脏数据（如"五一土耳其"）。
// 现在完全依赖 AI 主动调用 update_trip_info 工具写入结构化数据。
// ============================================================

// ============================================================
// Quick Replies 检测：从 AI 回复中提取可交互选项
// ============================================================

/** 预定义问题模式 → 选项映射 */
const QUICK_REPLY_PATTERNS = [
  {
    // 出发城市
    test: /(?:从哪.*出发|出发城市|出发地|哪个城市出发|从哪里?(?:出发|飞)|您将从哪)/,
    text: '出发城市？',
    options: ['北京', '上海', '广州', '深圳', '成都', '杭州'],
    allowInput: true,
    inputPlaceholder: '输入其他城市',
    constraintField: 'departCity'
  },
  {
    // 出发时间
    test: /(?:计划何时出发|什么时候出发|出发日期|出行时间|打算.*几月|哪个时间段)/,
    text: '出发时间？',
    options: ['五一假期', '端午假期', '暑假', '国庆假期'],
    allowInput: true,
    inputPlaceholder: '输入具体日期',
    constraintField: 'dates'
  },
  {
    // 日期弹性
    test: /(?:日期.*弹性|日期.*调整|时间.*灵活|日期.*固定|能否.*调整|接受前后调整|是否灵活)/,
    text: '日期可以弹性调整吗？',
    options: ['可以前后调1-2天', '日期固定不能变'],
    constraintField: 'dates',
    subField: 'flexible'
  },
  {
    // 请假天数
    test: /(?:最多.*请.*假|可以请几天假|请假.*天数)/,
    text: '最多能请几天假？',
    options: ['不请假（纯假期）', '1-2天', '3-5天', '可以灵活安排'],
    constraintField: 'dates',
    subField: 'notes'
  },
  {
    // 人数
    test: /(?:几个人|多少人|几人同行|同行.*人数|出行人数|几位.*出行)/,
    text: '几个人出行？',
    options: ['1人', '2人', '3-4人', '5人以上'],
    constraintField: 'people'
  },
  {
    // 同行人员特殊需求（老人/儿童）
    test: /(?:老人.*儿童|儿童.*老人|特殊需求|同行.*(?:老人|小孩|儿童|孕妇)|是否有.*(?:老人|儿童))/,
    text: '同行人员情况？',
    options: ['全部成人', '有老人', '有儿童', '有老人和儿童'],
    multiSelect: true,
    constraintField: 'people',
    subField: 'details'
  },
  {
    // 预算
    test: /(?:预算.*多少|预算.*范围|大概.*预算|费用.*预期|预算上限|预算细节)/,
    text: '预算大概多少（每人）？',
    options: ['5000以内', '1万左右', '2万左右', '3万以上'],
    allowInput: true,
    inputPlaceholder: '输入具体预算',
    constraintField: 'budget'
  },
  {
    // 预算是否含机票住宿
    test: /(?:是否已?包含机票|包含.*住宿.*费用|预算.*包含|是否含.*机票)/,
    text: '预算是否包含机票住宿？',
    options: ['包含所有费用', '不含机票', '不含机票和住宿'],
    constraintField: 'budget',
    subField: 'scope'
  },
  {
    // 单人预算 vs 总预算
    test: /(?:单人.*还是.*总|人均.*还是.*总|家庭总预算|双人.*预算)/,
    text: '预算是人均还是总预算？',
    options: ['人均预算', '总预算（含所有人）'],
    constraintField: 'budget',
    subField: 'per_person'
  },
  {
    // 红眼航班
    test: /(?:接受.*红眼|红眼航班|凌晨.*航班|深夜.*航班)/,
    text: '是否接受红眼航班？',
    options: ['可以接受', '尽量避免', '完全不接受'],
    constraintField: 'preferences',
    subField: 'notes'
  },
  {
    // 住宿偏好
    test: /(?:住宿.*偏好|酒店.*类型|住.*什么.*档次|住宿.*预算|经济型.*舒适型|酒店.*民宿)/,
    text: '住宿偏好？',
    options: ['经济型', '舒适型', '高档/度假村', '特色民宿'],
    multiSelect: true,
    allowInput: true,
    inputPlaceholder: '其他要求',
    constraintField: 'preferences'
  },
  {
    // 旅行风格/偏好
    test: /(?:旅行.*风格|偏好.*类型|喜欢.*什么.*玩|想.*怎么.*玩|特别想去.*景点|必去.*景点)/,
    text: '旅行风格偏好？',
    options: ['休闲度假', '深度文化', '户外探险', '美食购物'],
    multiSelect: true,
    allowInput: true,
    inputPlaceholder: '其他偏好',
    constraintField: 'preferences'
  },
  {
    // 餐饮要求
    test: /(?:餐饮.*要求|对餐饮|美食.*为主|饮食.*偏好|预算限制.*餐)/,
    text: '餐饮偏好？',
    options: ['尝试当地美食', '有预算限制', '无特殊要求'],
    multiSelect: true,
    constraintField: 'preferences'
  }
];

/**
 * 从 AI 回复中提取可交互选项
 * 层1：预定义问题模式匹配——扫描全文，多个问题可同时命中
 * 层2：编号列表检测（2-6项，每项≤40字）——仅在层1无命中时触发
 */
function extractQuickReplies(text, tripBook) {
  if (!text || text.length < 10) return [];
  const questions = [];

  // ── 层1：预定义问题模式匹配（扫描全文，允许多个命中）──
  for (const pattern of QUICK_REPLY_PATTERNS) {
    // 如果该字段在 TripBook 中已有值，跳过（避免重复提问）
    if (pattern.constraintField && tripBook) {
      const c = tripBook.constraints[pattern.constraintField];
      if (c) {
        // 如果指定了 subField，只检查对应子字段是否已有值
        if (pattern.subField) {
          const val = c[pattern.subField];
          if (val != null && val !== '' && val !== false) continue;
        } else {
          // 无 subField 时按字段类型检查主值
          if (pattern.constraintField === 'preferences') {
            if (c.tags?.length > 0) continue;
          } else if (pattern.constraintField === 'dates') {
            if (c.start || c.days) continue;
          } else if (pattern.constraintField === 'people') {
            if (c.count) continue;
          } else {
            if (c.value != null && c.value !== '') continue;
          }
        }
      }
    }

    if (pattern.test.test(text)) {
      const q = { text: pattern.text, options: [...pattern.options] };
      if (pattern.allowInput) {
        q.allowInput = true;
        q.inputPlaceholder = pattern.inputPlaceholder || '请输入';
      }
      if (pattern.multiSelect) {
        q.multiSelect = true;
      }
      questions.push(q);
    }
  }

  // 层1 命中时直接返回（最多保留 5 组，避免过长）
  if (questions.length > 0) {
    return questions.slice(0, 5);
  }

  // ── 层2：编号列表检测（仅在层1未命中时触发）──
  // 匹配 "1. XXX" 或 "1、XXX" 或 "1）XXX" 格式的编号列表
  const listPattern = /(?:^|\n)\s*(\d+)\s*[.、）)]\s*(.+)/g;
  const items = [];
  let match;
  // 只在末尾 800 字符中搜索
  const searchArea = text.slice(-800);
  while ((match = listPattern.exec(searchArea)) !== null) {
    const itemText = match[2].replace(/\*\*/g, '').trim();
    // 过滤：每项不超过 40 字，排除太长的段落描述
    // 过滤：包含问号的是子问题，不是可选选项
    if (itemText.length > 0 && itemText.length <= 40 && !/[？?]/.test(itemText)) {
      items.push(itemText);
    }
  }
  // 至少2个，最多6个选项
  if (items.length >= 2 && items.length <= 6) {
    // 检测列表前面是否有问句（末尾区域有 ？ 或 ?）
    const beforeList = searchArea.slice(0, searchArea.indexOf(items[0]));
    const hasQuestion = /[？?]\s*$/.test(beforeList.trim()) || /[？?]/.test(beforeList.slice(-80));
    if (hasQuestion) {
      questions.push({ text: '', options: items });
    }
  }

  return questions;
}

// ============================================================
// OpenAI Agent 循环
// ============================================================
async function handleOpenAIChat(apiKey, model, systemPrompt, userMessages, sendSSE, baseUrl, tripBook) {
  const clientOpts = { apiKey };
  if (baseUrl) clientOpts.baseURL = baseUrl;
  const client = new OpenAI(clientOpts);
  const tools = getToolDefinitions();
  const selectedModel = model || 'gpt-4o';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...userMessages
  ];

  const MAX_TOOL_ROUNDS = 10;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // 真流式调用
    const stream = await client.chat.completions.create({
      model: selectedModel,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    });

    let fullText = '';
    const toolCallsMap = {}; // index -> 累积的 tool_call

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      const delta = choice.delta;

      // 实时转发文本 token
      if (delta.content) {
        fullText += delta.content;
        sendSSE('token', { text: delta.content });
      }

      // 累积工具调用（流式中分片到达）
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCallsMap[tc.index]) {
            toolCallsMap[tc.index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
          }
          if (tc.id) toolCallsMap[tc.index].id = tc.id;
          if (tc.function?.name) toolCallsMap[tc.index].function.name += tc.function.name;
          if (tc.function?.arguments) toolCallsMap[tc.index].function.arguments += tc.function.arguments;
        }
      }
    }

    const toolCalls = Object.values(toolCallsMap);

    if (toolCalls.length > 0) {
      // 追加含工具调用的 assistant 消息
      messages.push({
        role: 'assistant',
        content: fullText || null,
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments }
        }))
      });

      for (const toolCall of toolCalls) {
        const funcName = toolCall.function.name;
        const toolId = toolCall.id;
        let funcArgs;
        try {
          funcArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          funcArgs = {};
        }

        const resultStr = await runTool(funcName, funcArgs, toolId, sendSSE, tripBook);
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: resultStr });
      }

      continue; // 继续下一轮
    }

    return fullText; // 返回完整回复文本供 quick_replies 检测
  }
}

// ============================================================
// Anthropic Agent 循环
// ============================================================
async function handleAnthropicChat(apiKey, model, systemPrompt, userMessages, sendSSE, baseUrl, tripBook) {
  const clientOpts = { apiKey };
  if (baseUrl) clientOpts.baseURL = baseUrl;
  const client = new Anthropic(clientOpts);
  const tools = getToolDefinitionsForAnthropic();
  const selectedModel = model || 'claude-sonnet-4-20250514';

  const messages = [...userMessages];

  const MAX_TOOL_ROUNDS = 10;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // 真流式调用
    const stream = client.messages.stream({
      model: selectedModel,
      system: systemPrompt,
      messages,
      tools,
      max_tokens: 4096,
      temperature: 0.7,
    });

    // 实时转发文本 token
    stream.on('text', (text) => {
      sendSSE('token', { text });
    });

    // 等待完整响应（含工具调用信息）
    const response = await stream.finalMessage();

    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

    if (toolUseBlocks.length > 0) {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        const resultStr = await runTool(toolUse.name, toolUse.input, toolUse.id, sendSSE, tripBook);
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: resultStr });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // 无工具调用 → 返回完整回复文本
    const textBlocks = response.content.filter(b => b.type === 'text');
    const fullText = textBlocks.map(b => b.text).join('');

    return fullText; // 返回完整回复文本供 quick_replies 检测
  }
  return '';
}

// ============================================================
// 启动服务器
// ============================================================
initDestCache();

app.listen(PORT, () => {
  console.log(`\n🌏 AI Travel Planner 已启动`);
  console.log(`   http://localhost:${PORT}\n`);
});
