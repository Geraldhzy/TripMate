const express = require('express');
const path = require('path');
const { OpenAI } = require('openai');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const Sentry = require('@sentry/node');
const { validate, sanitizeBody, validateHeaders, chatRequestSchema } = require('./middleware/validation');
const { getHelmetConfig, getCorsConfig, additionalSecurityHeaders, globalErrorHandler } = require('./middleware/security');
const { getToolDefinitions, getMainAgentToolDefinitions, executeToolCall, SUB_AGENT_EXCLUSIVE_TOOLS } = require('./tools');
const { buildSystemPrompt } = require('./prompts/system-prompt');
const { TripBook } = require('./models/trip-book');
const { executeDelegation } = require('./agents/delegate');
const log = require('./utils/logger');
const { DEFAULT_MODELS } = require('./utils/constants');

const app = express();

// ============================================================
// Sentry Error Monitoring Setup
// ============================================================
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.SENTRY_TRACE_SAMPLE_RATE ? parseFloat(process.env.SENTRY_TRACE_SAMPLE_RATE) : 0.1,
    debug: process.env.SENTRY_DEBUG === 'true'
  });

  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

// ============================================================
// Security Middleware Setup
// ============================================================

app.use(getHelmetConfig());

const corsConfig = getCorsConfig();
app.use(require('cors')(corsConfig));

app.use(additionalSecurityHeaders());

// ============================================================
// Request Parsing & Sanitization
// ============================================================
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.use(sanitizeBody());

const PORT = process.env.PORT || 3000;

// ============================================================
// Rate Limiting Configuration
// ============================================================

const generalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.headers['x-skip-rate-limit'] === process.env.RATE_LIMIT_BYPASS_KEY,
});

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: '您的对话请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.headers['x-skip-rate-limit'] === process.env.RATE_LIMIT_BYPASS_KEY,
});

const toolLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { error: '工具调用请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.headers['x-skip-rate-limit'] === process.env.RATE_LIMIT_BYPASS_KEY,
});

app.use(generalLimiter);

// ============================================================
// POST /api/chat — Agent 核心路由（SSE 流式）
// ============================================================
app.post('/api/chat', validateHeaders(), validate(chatRequestSchema), chatLimiter, toolLimiter, async (req, res) => {
  const { messages, provider, model, tripBookSnapshot } = req.body;
  const apiKey = req.headers['x-api-key'];
  const baseUrl = req.headers['x-base-url'] || '';

  const reqId = log.generateId();
  const reqLog = log.child({ reqId });
  const reqTimer = reqLog.startTimer('request');
  reqLog.info('收到请求', { provider, model, msgCount: messages?.length });

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
    const tripBook = new TripBook();

    // 从客户端快照恢复 TripBook 状态
    try {
      if (tripBookSnapshot) {
        if (tripBookSnapshot.constraints) tripBook.updateConstraints(tripBookSnapshot.constraints);
        if (tripBookSnapshot.itinerary) tripBook.updateItinerary(tripBookSnapshot.itinerary);
      }
    } catch (err) {
      reqLog.error('TripBook 快照恢复失败', {
        error: err.message,
        stack: err.stack,
        snapshot: tripBookSnapshot ? JSON.stringify(tripBookSnapshot).slice(0, 300) : 'null'
      });
    }

    const conversationText = messages.map(m => m.content || '').join(' ');
    const systemPrompt = buildSystemPrompt(conversationText, tripBook);

    let fullText = '';
    reqLog.info('开始 LLM 调用', { provider, model });
    const effectiveBaseUrl = (provider === 'deepseek') ? (baseUrl || 'https://api.deepseek.com/v1') : baseUrl;
    fullText = await handleChat(apiKey, model, systemPrompt, messages, sendSSE, effectiveBaseUrl, tripBook, reqLog) || '';

    // Quick Replies 检测
    const quickReplies = extractQuickReplies(fullText);
    if (quickReplies.length > 0) {
      sendSSE('quick_replies', { questions: quickReplies });
    }

    sendSSE('done', {});
    reqTimer.done({ provider, model, responseLen: fullText.length });
  } catch (err) {
    reqLog.error('请求处理失败', { error: err.message, stack: err.stack });
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(err, {
        tags: { context: 'chat_endpoint' }
      });
    }
    sendSSE('error', { message: err.message || '未知错误' });
  } finally {
    res.end();
  }
});

// ============================================================
// 工具执行辅助
// ============================================================

/** 从工具结果中提取人类可读的简短标签 */
function getToolResultLabel(funcName, funcArgs, resultStr) {
  try {
    const data = JSON.parse(resultStr);
    if (data.error) return null;
    switch (funcName) {
      case 'web_search': {
        const count = data.results?.length || 0;
        const q = (funcArgs.query || '').substring(0, 20);
        return `找到 ${count} 条结果：「${q}${funcArgs.query?.length > 20 ? '…' : ''}」`;
      }
      case 'search_poi': {
        const count = Array.isArray(data.results) ? data.results.length : (Array.isArray(data) ? data.length : 0);
        return `找到 ${count} 个地点`;
      }
      case 'search_hotels': {
        const count = Array.isArray(data.hotels) ? data.hotels.length : 0;
        const city = funcArgs.city || '';
        return count > 0 ? `找到 ${count} 家${city ? ' ' + city : ''}酒店` : '暂无酒店结果';
      }
      case 'search_flights': {
        const count = Array.isArray(data.flights) ? data.flights.length : 0;
        return count > 0 ? `找到 ${count} 个航班` : '暂无航班结果';
      }
      case 'update_trip_info': {
        // 从工具入参 + 工具返回结果两个来源推断用户友好的描述
        const parts = [];
        const args = funcArgs || {};
        // 优先从工具返回结果中的 updates 获取（更可靠）
        const updates = data.updates || {};
        const constraints = args.constraints || updates.constraints;
        const itinerary = args.itinerary || updates.itinerary;
        const phase = args.phase !== undefined ? args.phase : updates.phase;

        if (constraints) {
          const fields = Object.keys(constraints).filter(k => k !== '_reason');
          const LABELS = { destination: '目的地', departCity: '出发城市', dates: '出行时间', people: '人数', budget: '预算', preferences: '偏好' };
          const names = fields.map(f => LABELS[f] || f).slice(0, 3);
          if (names.length > 0) parts.push(`已记录${names.join('、')}${fields.length > 3 ? '等信息' : ''}`);
        }
        if (itinerary) {
          if (itinerary.days && Array.isArray(itinerary.days)) {
            const dayNums = itinerary.days.map(d => d.day).filter(Boolean);
            if (dayNums.length > 0) {
              // 连续天数用范围表示：Day 1-10，非连续用逗号：Day 1、3、5
              const sorted = dayNums.sort((a, b) => a - b);
              let dayStr;
              if (sorted.length >= 3 && sorted[sorted.length - 1] - sorted[0] === sorted.length - 1) {
                dayStr = `Day ${sorted[0]}-${sorted[sorted.length - 1]}`;
              } else {
                dayStr = `Day ${sorted.join('、')}`;
              }
              parts.push(`已更新 ${dayStr} 行程`);
            } else {
              parts.push('行程已更新');
            }
          } else if (itinerary.route) {
            parts.push('路线已规划');
          }
          if (itinerary.theme) parts.push('主题已设定');
          if (itinerary.budgetSummary) parts.push('预算已生成');
          if (itinerary.reminders || itinerary.practicalInfo) parts.push('行前准备已更新');
        }
        if (parts.length === 0 && phase !== undefined) {
          const PHASE_NAMES = { 1: '需求确认完成', 2: '框架规划中', 3: '详情完善中', 4: '行程总结中' };
          parts.push(PHASE_NAMES[phase] || '阶段已更新');
        }
        return parts.length > 0 ? parts.join('，') : '行程信息已同步';
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function runTool(funcName, funcArgs, toolId, sendSSE, tripBook, delegateCtx, reqLog) {
  const toolLog = (reqLog || log).child({ tool: funcName });
  const toolTimer = toolLog.startTimer(`tool:${funcName}`);

  // ── 子 Agent 独占工具拦截：主 Agent 禁止直接调用 ──
  if (SUB_AGENT_EXCLUSIVE_TOOLS.has(funcName)) {
    toolLog.warn('主Agent尝试调用子Agent独占工具，已拦截', { tool: funcName });
    sendSSE('tool_start', { id: toolId, name: funcName, arguments: funcArgs });
    const errMsg = `⚠️ ${funcName} 是子Agent独占工具，主Agent不可直接调用。请使用 delegate_to_agents 将任务委派给对应的子Agent。`;
    sendSSE('tool_result', { id: toolId, name: funcName, resultLabel: '已拦截：请使用委派' });
    return errMsg;
  }

  // ── delegate_to_agents 特殊处理 ──
  if (funcName === 'delegate_to_agents') {
    sendSSE('tool_start', { id: toolId, name: funcName, arguments: funcArgs });
    try {
      const { provider, apiKey, model, baseUrl } = delegateCtx || {};
      toolLog.info('开始委派', { taskCount: funcArgs.tasks?.length, agents: funcArgs.tasks?.map(t => t.agent) });
      const resultStr = await executeDelegation(
        funcArgs.tasks, provider, apiKey, model, sendSSE, baseUrl, undefined, reqLog
      );
      toolTimer.done({ resultLen: resultStr.length });

      // 动态生成 resultLabel
      let delegateLabel = '信息搜集完成';
      try {
        const parsed = JSON.parse(resultStr);
        if (parsed.results && Array.isArray(parsed.results)) {
          const labels = parsed.results.map(r => {
            const agentLabel = r.agent === 'flight' ? '✈️ 机票查询' : r.agent === 'research' ? '📋 目的地调研' : r.agent;
            return r.status === 'success' ? `${agentLabel}完成` : `${agentLabel}失败`;
          });
          delegateLabel = labels.join(' · ');
        }
      } catch {}
      sendSSE('tool_result', { id: toolId, name: funcName, resultLabel: delegateLabel });
      return resultStr;
    } catch (err) {
      toolLog.error('委派执行失败', { error: err.message, stack: err.stack });
      const errMsg = `delegate_to_agents 执行失败: ${err.message}`;
      sendSSE('tool_result', { id: toolId, name: funcName, resultLabel: '信息搜集失败，请重试' });
      return errMsg;
    }
  }

  sendSSE('tool_start', { id: toolId, name: funcName, arguments: funcArgs });
  toolLog.debug('开始执行', { args: JSON.stringify(funcArgs).slice(0, 200) });
  try {
    const result = await withTimeout(
      executeToolCall(funcName, funcArgs),
      TOOL_TIMEOUT_MS,
      `工具 ${funcName}`
    );
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    const resultLabel = getToolResultLabel(funcName, funcArgs, resultStr);
    toolTimer.done({ resultLen: resultStr.length, label: resultLabel });
    sendSSE('tool_result', {
      id: toolId, name: funcName,
      resultLabel
    });

    // ── 将工具结果同步到 TripBook ──
    if (tripBook) {
      try {
        const parsed = JSON.parse(resultStr);

        // 机票报价 → TripBook
        if (funcName === 'search_flights' && Array.isArray(parsed.flights)) {
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

        // web_search → TripBook 搜索记录（避免 LLM 重复搜索）
        if (funcName === 'web_search' && !parsed.error) {
          const query = funcArgs.query || parsed.query || '';
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
          sendSSE('tripbook_update', {
            ...tripBook.toPanelData(),
            _snapshot: tripBook.toJSON()
          });
        }
      } catch (err) {
      reqLog.error('TripBook 工具结果同步失败', {
        error: err.message,
        stack: err.stack
      });
    }
    }

    return resultStr;
  } catch (toolErr) {
    toolLog.error('工具执行失败', { error: toolErr.message, stack: toolErr.stack });
    const errMsg = `工具 ${funcName} 执行失败: ${toolErr.message}`;
    sendSSE('tool_result', { id: toolId, name: funcName, resultLabel: null });
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(toolErr, {
        tags: { context: 'tool_execution', tool: funcName }
      });
    }
    return errMsg;
  }
}

// ============================================================
// Quick Replies 检测
// ============================================================
function extractQuickReplies(text) {
  if (!text || text.length < 10) return [];

  const searchArea = text.slice(-800);
  const listPattern = /^\s*(\d+)[.、)）]\s*(.+)/gm;
  const items = [];
  let match;

  while ((match = listPattern.exec(searchArea)) !== null) {
    const label = match[2].replace(/\*\*/g, '').trim();
    if (label.length === 0 || label.length > 40) continue;
    if (/[？?]/.test(label)) continue;
    items.push({ label, value: label });
  }

  if (items.length < 2) return [];
  return items.slice(0, 4);
}

// ============================================================
// OpenAI Streaming + Agent Chat Loop
// ============================================================

function withTimeout(promise, ms, label = 'operation') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} 超时 (${ms / 1000}s)`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

const LLM_TIMEOUT_MS = 300000;
const TOOL_TIMEOUT_MS = 30000;

// ============================================================
// DSML 解析器：将 DeepSeek 原生 DSML 格式转换为 OpenAI tool_calls
// ============================================================

/**
 * 检测文本中是否包含 DSML 格式的 function call
 * DeepSeek 模型（尤其 R1）可能将 tool call 以 DSML XML 标签输出到 content 中，
 * 而不是通过 OpenAI 兼容的 delta.tool_calls 字段返回。
 */
function containsDSML(text) {
  if (!text) return false;
  // 匹配全角竖线 ｜(U+FF5C) 和半角竖线 | 两种变体
  return /(?:<[｜|]\s*DSML[｜|]\s*function_calls\s*>|<[｜|]\s*DSML[｜|]\s*invoke\b)/i.test(text);
}

/**
 * 从文本中解析 DSML 格式的 function calls，转换为 OpenAI tool_calls 结构
 * @param {string} text - 包含 DSML 标签的 LLM 输出文本
 * @returns {{ toolCalls: Array<{id: string, name: string, args: object}>, rawToolCalls: Array, cleanText: string }}
 */
function parseDSMLToolCalls(text) {
  if (!text) return { toolCalls: [], rawToolCalls: [], cleanText: text };

  // 支持全角 ｜ 和半角 | 两种变体
  const SEP = '[｜|]';

  // 匹配整个 <｜DSML｜function_calls>...</｜DSML｜function_calls> 块
  const blockRegex = new RegExp(
    `<${SEP}\\s*DSML${SEP}\\s*function_calls\\s*>[\\s\\S]*?<\\/${SEP}\\s*DSML${SEP}\\s*function_calls\\s*>`,
    'g'
  );

  // 匹配每个 <｜DSML｜invoke name="...">...</｜DSML｜invoke> 调用
  const invokeRegex = new RegExp(
    `<${SEP}\\s*DSML${SEP}\\s*invoke\\s+name="([^"]+)"\\s*>([\\s\\S]*?)<\\/${SEP}\\s*DSML${SEP}\\s*invoke\\s*>`,
    'g'
  );

  // 匹配每个 <｜DSML｜parameter name="..." ...>VALUE</｜DSML｜parameter>
  const paramRegex = new RegExp(
    `<${SEP}\\s*DSML${SEP}\\s*parameter\\s+name="([^"]+)"[^>]*>([\\s\\S]*?)<\\/${SEP}\\s*DSML${SEP}\\s*parameter\\s*>`,
    'g'
  );

  const toolCalls = [];
  const rawToolCalls = [];
  let callIndex = 0;

  // 提取所有 function_calls 块
  const blocks = text.match(blockRegex);
  if (!blocks || blocks.length === 0) {
    return { toolCalls: [], rawToolCalls: [], cleanText: text };
  }

  for (const block of blocks) {
    let invokeMatch;
    invokeRegex.lastIndex = 0;

    while ((invokeMatch = invokeRegex.exec(block)) !== null) {
      const funcName = invokeMatch[1].trim();
      const invokeBody = invokeMatch[2];

      // 解析参数
      const args = {};
      let paramMatch;
      paramRegex.lastIndex = 0;

      while ((paramMatch = paramRegex.exec(invokeBody)) !== null) {
        const paramName = paramMatch[1].trim();
        let paramValue = paramMatch[2].trim();

        // 尝试 JSON 解析参数值
        try {
          paramValue = JSON.parse(paramValue);
        } catch {
          // 保持字符串原值
        }
        args[paramName] = paramValue;
      }

      const callId = `dsml_call_${Date.now()}_${callIndex++}`;
      const argsStr = JSON.stringify(args);

      toolCalls.push({ id: callId, name: funcName, args });
      rawToolCalls.push({
        id: callId,
        type: 'function',
        function: { name: funcName, arguments: argsStr }
      });
    }
  }

  // 从原文中移除 DSML 块，保留其余文本内容
  let cleanText = text.replace(blockRegex, '').replace(/\n{3,}/g, '\n\n').trim();

  return { toolCalls, rawToolCalls, cleanText };
}

/**
 * 过滤 LLM 输出中可能泄露的 function call / tool_call JSON 片段
 * 某些模型（尤其 DeepSeek）在非 tool_call 回合也会输出类似工具调用的 JSON
 */
function sanitizeLLMOutput(text) {
  if (!text) return text;

  const TOOL_NAMES = ['web_search', 'search_poi', 'search_flights', 'search_hotels',
    'update_trip_info', 'delegate_to_agents', 'get_weather', 'get_exchange_rate',
    'cache_destination_knowledge'];
  const toolNamePattern = TOOL_NAMES.join('|');

  let cleaned = text;

  // 1. 移除 <think>...</think> 块（DeepSeek reasoner 思考过程）
  cleaned = cleaned.replace(/<think>[\s\S]*?(<\/think>|$)/g, '');

  // 2. 移除 DSML 标签（DeepSeek 特有格式）— 支持全角 ｜ 和半角 | 两种变体
  cleaned = cleaned.replace(/<[｜|]?\s*DSML[\s\S]*?DSML\s*[｜|]?>/g, '');
  // 移除残留的 DSML 起止标签（匹配不完整时的兜底）
  cleaned = cleaned.replace(/<\/?[｜|]?\s*DSML[｜|]?\s*(?:function_calls|invoke|parameter)[^>]*>/g, '');

  // 3. 移除工具调用 JSON（含嵌套大括号）：匹配 {"name":"tool_name" 开头直到平衡的 }
  const toolCallRegex = new RegExp(`\\{[\\s]*"(?:name|function)"[\\s]*:[\\s]*"(?:${toolNamePattern})"[\\s\\S]*?(?:\\}\\s*){1,3}`, 'g');
  cleaned = cleaned.replace(toolCallRegex, '');

  // 4. 移除 tool_calls 数组：[{"id":"call_...", "type":"function", ...}]
  cleaned = cleaned.replace(/\[\s*\{[\s]*"id"\s*:\s*"call_[\s\S]*?\}\s*\]/g, '');

  // 5. 移除形如 {"id":"call_xxx",...} 单个工具调用对象
  cleaned = cleaned.replace(/\{\s*"id"\s*:\s*"call_[^"]*"[\s\S]*?\}\s*(?:\]\s*)?/g, '');

  // 6. 移除 <function_calls>/<invoke>/<parameter> XML 标签（部分模型会输出）
  cleaned = cleaned.replace(/<\/?function_calls?>/g, '');
  cleaned = cleaned.replace(/<\/?invoke[^>]*>/g, '');
  cleaned = cleaned.replace(/<parameter[^>]*>[\s\S]*?<\/parameter>/g, '');
  cleaned = cleaned.replace(/<\/?parameter[^>]*>/g, '');

  // 7. 清理多余的连续空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim() || text;  // fallback 到原文防止全部被清除
}

/**
 * Stream an OpenAI-format completion, forwarding tokens via SSE.
 */
async function streamOpenAI(client, model, messages, tools, sendSSE, silent = false) {
  const hasTools = Array.isArray(tools) && tools.length > 0;
  const createParams = {
    model,
    messages,
    temperature: 0.7,
    max_tokens: 8192,
    stream: true,
  };
  if (hasTools) {
    createParams.tools = tools;
    createParams.tool_choice = 'auto';
  }

  const stream = await withTimeout(
    client.chat.completions.create(createParams),
    LLM_TIMEOUT_MS,
    'OpenAI stream 创建'
  );

  let fullText = '';
  const toolCallsMap = {};

  const streamPromise = (async () => {
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      const delta = choice.delta;

      if (delta.content) {
        fullText += delta.content;
        if (!silent) sendSSE('token', { text: delta.content });
      }

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
  })();

  await withTimeout(streamPromise, LLM_TIMEOUT_MS, 'OpenAI stream 读取');

  let rawToolCalls = Object.values(toolCallsMap);
  let toolCalls = rawToolCalls.map(tc => {
    let args;
    try { 
      args = JSON.parse(tc.function.arguments); 
    } 
    catch (e) { 
      log.error('[STREAM] JSON.parse failed for tool', {
        toolName: tc.function.name,
        error: e.message,
        argumentsPreview: tc.function.arguments ? tc.function.arguments.slice(0, 200) : 'undefined'
      });
      args = {}; 
    }
    return { id: tc.id, name: tc.function.name, args };
  });

  // ── DSML 兜底：DeepSeek 模型可能将 tool call 以 DSML 标签输出到 content 中 ──
  // 当 OpenAI SDK 未解析到任何 tool_calls 但文本中包含 DSML 时，手动解析并转换
  if (toolCalls.length === 0 && containsDSML(fullText)) {
    const dsmlResult = parseDSMLToolCalls(fullText);
    if (dsmlResult.toolCalls.length > 0) {
      toolCalls = dsmlResult.toolCalls;
      rawToolCalls = dsmlResult.rawToolCalls;
      fullText = dsmlResult.cleanText; // 剥离已解析的 DSML 块，避免泄漏到前端
    }
  }

  const rawAssistant = {
    role: 'assistant',
    content: fullText || null,
    ...(rawToolCalls.length > 0 ? {
      tool_calls: rawToolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.function.name, arguments: tc.function.arguments }
      }))
    } : {})
  };

  return { fullText, toolCalls, rawAssistant };
}

async function handleChat(apiKey, model, systemPrompt, userMessages, sendSSE, baseUrl, tripBook, reqLog) {
  const chatLog = (reqLog || log);

  const clientOpts = { apiKey };
  if (baseUrl) clientOpts.baseURL = baseUrl;
  const client = new OpenAI(clientOpts);
  const tools = getMainAgentToolDefinitions();
  const selectedModel = model || DEFAULT_MODELS.openai;

  const messages = [{ role: 'system', content: systemPrompt }, ...userMessages];

  const MAX_TOOL_ROUNDS = 10;
  let delegationCount = 0;
  const delegatedAgents = new Set(); // 记录已成功委派过的 agent 类型，防止重复委派
  let pendingCoverMsg = null; // coveredTopics 消息暂存，等 tool 消息全部 push 后再注入

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (round > 0) {
      sendSSE('round_start', { round: round + 1 });
    }
    sendSSE('thinking', {});
    chatLog.info(`主Agent轮次 ${round + 1}/${MAX_TOOL_ROUNDS}`, { msgCount: messages.length });
    const llmTimer = chatLog.startTimer('llm_call');

    const { fullText, toolCalls, rawAssistant } = await streamOpenAI(client, selectedModel, messages, tools, sendSSE, false);

    llmTimer.done({ textLen: fullText.length, toolCallCount: toolCalls.length });

    if (toolCalls.length === 0) {
      sendSSE('thinking_done', {});
      // 过滤可能泄露的 function call JSON 片段
      const safeText = sanitizeLLMOutput(fullText);
      sendSSE('token', { text: safeText });

      // 最终输出时检查 phase 是否需要推进（LLM 可能在文本中输出预算但没调工具）
      try {
        const curPhase = (tripBook.itinerary && tripBook.itinerary.phase) || 0;
        if (curPhase < 4 && tripBook.itinerary.budgetSummary && tripBook.itinerary.budgetSummary.total_cny) {
          tripBook.updatePhase(4);
          sendSSE('tripbook_update', { ...tripBook.toPanelData(), _snapshot: tripBook.toJSON() });
        }
      } catch {}

      return safeText;
    }

    // 有工具调用时也发 thinking_done，让前端清除思考指示器
    sendSSE('thinking_done', {});

    messages.push(rawAssistant);

    // ⚠️ 轮次检查：在执行工具前进行（防止在 maxRounds 触发时仍然执行工具）
    if (round + 1 >= MAX_TOOL_ROUNDS && toolCalls.length > 0) {
      chatLog.warn('轮次已满，拒绝工具调用', {
        currentRound: round + 1,
        maxRounds: MAX_TOOL_ROUNDS,
        toolCount: toolCalls.length
      });
      // 给每个 tool_call 填充拒绝响应（保证 assistant.tool_calls → tool 消息顺序完整）
      for (const tc of toolCalls) {
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: '⚠️ 已达工具调用轮次上限，本次工具调用被跳过。请直接基于已有信息生成最终总结回复用户。'
        });
      }
      // 跳出循环，进入下方"最终总结"LLM 调用
      break;
    }

    // ── 并行执行所有工具调用（包括委派检查） ──
    const toolPromises = toolCalls.map(async (tc) => {
      // 委派检查在执行前进行（保持顺序一致性）
      if (tc.name === 'delegate_to_agents') {
        delegationCount++;
        if (delegationCount > 2) {
          chatLog.warn('检测到重复委派，跳过', { delegationCount });
          return { id: tc.id, content: '已达到本轮委派上限，请直接基于已有信息回复用户。', toolName: tc.name };
        }

        // 过滤掉已成功委派过的 agent 类型（防止同类型重复委派）
        if (tc.args && Array.isArray(tc.args.tasks)) {
          const originalCount = tc.args.tasks.length;
          tc.args.tasks = tc.args.tasks.filter(t => {
            if (delegatedAgents.has(t.agent)) {
              chatLog.warn('拦截重复委派的子Agent', { agent: t.agent, task: t.task?.slice(0, 80) });
              return false;
            }
            return true;
          });
          if (tc.args.tasks.length === 0) {
            chatLog.warn('所有子Agent均已执行过，跳过委派', { filtered: originalCount });
            return { id: tc.id, content: `所有指定的子Agent（${Array.from(delegatedAgents).join(', ')}）在本次对话中已执行过，结果已在上方。请直接基于已有信息回复用户，不要重复委派。`, toolName: tc.name };
          }
        }
      }

      const delegateCtx = { provider: 'openai', apiKey, model: selectedModel, baseUrl };
      const resultStr = await runTool(tc.name, tc.args, tc.id, sendSSE, tripBook, delegateCtx, reqLog);
      
      // 对 delegate_to_agents 的结果，记录已委派 agent + 收集 coveredTopics
      if (tc.name === 'delegate_to_agents') {
        try {
          const delegResult = JSON.parse(resultStr);
          // 记录已成功委派的 agent 类型
          if (delegResult.results && Array.isArray(delegResult.results)) {
            for (const r of delegResult.results) {
              if (r.status === 'success' && r.agent) {
                delegatedAgents.add(r.agent);
              }
            }
            chatLog.debug('已记录委派过的Agent', { delegatedAgents: Array.from(delegatedAgents) });
          }
          // 收集 coveredTopics（不在这里 push 到 messages，避免打断 tool_calls → tool 消息顺序）
          if (delegResult.coveredTopics && delegResult.coveredTopics.length > 0) {
            pendingCoverMsg = `⚠️ **已覆盖主题（严禁重复查询）**：
${delegResult.coveredTopics.map(t => `• ${t}`).join('\n')}

${delegResult._instruction || ''}`.trim();
            chatLog.debug('已收集 coveredTopics（待注入）', {
              topics: delegResult.coveredTopics,
              topicCount: delegResult.coveredTopics.length
            });
          }
        } catch (e) {
          chatLog.debug('coveredTopics 提取失败', { error: e.message });
        }
      }

      return { id: tc.id, content: resultStr, toolName: tc.name };
    });

    // 并行等待所有工具执行完成
    const toolSettled = await Promise.allSettled(toolPromises);
    const toolResults = toolSettled.map((r, i) => {
      if (r.status === 'fulfilled') {
        return r.value;
      }
      const tc = toolCalls[i];
      chatLog.error('工具执行失败', { tool: tc.name, error: r.reason?.message });
      return { id: tc.id, content: `工具 ${tc.name} 执行失败: ${r.reason?.message || '未知错误'}`, toolName: tc.name };
    });

    // ── 自动推进 phase ──
    try {
      const currentPhase = (tripBook.itinerary && tripBook.itinerary.phase) || 0;
      const toolNames = toolCalls.map(tc => tc.name);
      let inferredPhase = currentPhase;

      if (currentPhase < 2 && toolNames.some(n => ['delegate_to_agents', 'search_flights'].includes(n))) {
        inferredPhase = 2;
      } else if (currentPhase < 3 && toolNames.some(n => ['search_hotels', 'search_poi'].includes(n))) {
        inferredPhase = 3;
      }

      // phase 4 自动推进：多种触发条件
      if (currentPhase < 4) {
        // 条件1: TripBook 已有 budgetSummary（工具执行后已同步）
        if (tripBook.itinerary.budgetSummary && tripBook.itinerary.budgetSummary.total_cny) {
          inferredPhase = 4;
        }
        // 条件2: LLM 主动传了 phase=4 或 budgetSummary
        if (toolNames.includes('update_trip_info')) {
          for (const tc of toolCalls) {
            if (tc.name === 'update_trip_info') {
              try {
                const args = tc.args || {};
                if (args.itinerary?.budgetSummary || args.phase === 4) {
                  inferredPhase = 4;
                }
              } catch {}
            }
          }
        }
      }

      if (inferredPhase > currentPhase) {
        chatLog.info('自动推进 phase', { from: currentPhase, to: inferredPhase, trigger: toolNames.join(',') });
        tripBook.updatePhase(inferredPhase);
        sendSSE('tripbook_update', {
          ...tripBook.toPanelData(),
          _snapshot: tripBook.toJSON()
        });
      }
    } catch (err) {
      chatLog.warn('自动推进 phase 失败', { error: err.message });
    }

    // 先 push 所有 tool 消息（保证 assistant.tool_calls → tool 消息顺序完整）
    for (const r of toolResults) {
      messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
    }

    // 再注入 coveredTopics 的 user 消息（在 tool 消息之后，不会打断 OpenAI 要求的消息顺序）
    if (pendingCoverMsg) {
      messages.push({ role: 'user', content: pendingCoverMsg });
      pendingCoverMsg = null;
    }
  }

  // MAX_TOOL_ROUNDS 耗尽 — 最后一轮不带 tools，让 LLM 生成最终总结
  chatLog.warn('工具调用轮次已达上限，执行最终总结', { maxRounds: MAX_TOOL_ROUNDS, delegationCount });
  sendSSE('thinking_done', {});

  // 追加一条系统级提示，引导 LLM 输出最终总结而非继续调用工具
  messages.push({
    role: 'user',
    content: '请直接基于上方已获取的所有信息，为我生成完整的回复。不需要再搜索任何内容。'
  });

  try {
    // 不传 tools → LLM 无法调用工具，必须直接输出文本；silent=false 直接流式输出
    const { fullText: finalText } = await streamOpenAI(client, selectedModel, messages, [], sendSSE, false);
    return finalText;
  } catch (err) {
    chatLog.error('最终总结调用失败', { error: err.message });
    // 不向用户暴露技术性错误
    return '';
  }
}

// ============================================================
// Sentry Error Handler Middleware
// ============================================================
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      if (error.status === 404) return false;
      return error.status >= 500 || !error.status;
    }
  }));
}

app.use(globalErrorHandler());

// ============================================================
// 启动服务器
// ============================================================

app.listen(PORT, () => {
  log.info('AI Travel Planner 已启动', { port: PORT, env: process.env.NODE_ENV || 'development' });
  if (process.env.SENTRY_DSN) {
    log.info('Sentry monitoring enabled');
  }

  const MEM_WARN_MB = 512;
  setInterval(() => {
    const mem = process.memoryUsage();
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
    if (rssMB > MEM_WARN_MB) {
      log.warn('内存警告', { rssMB, heapMB, threshold: MEM_WARN_MB });
      if (global.gc) {
        log.info('触发手动 GC');
        global.gc();
      }
    }
  }, 30000).unref();
});
