/**
 * 子 Agent 执行器
 * 支持 OpenAI / Anthropic 两种 LLM 调用格式
 * 每个子 Agent 独立运行，最多 maxRounds 轮工具调用
 */
const { OpenAI } = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
// NOTE: 不要在顶层 require('../tools')，会产生循环依赖
// tools/index.js → agents/delegate.js → sub-agent-runner.js → tools/index.js
// 改为在函数内部延迟加载
const { AGENT_CONFIGS } = require('./config');
const log = require('../utils/logger');

// 单个工具结果的最大字符数（DeepSeek 支持 128K 上下文，可以给宽裕空间）
const MAX_TOOL_RESULT_CHARS = 15000;

/**
 * 延迟加载 tools 模块，避免循环依赖
 */
let _tools = null;
function getTools() {
  if (!_tools) {
    _tools = require('../tools');
  }
  return _tools;
}

/**
 * 从全局工具列表中筛选出指定 Agent 的工具子集
 */
function getToolsForAgent(agentType, format = 'openai') {
  const config = AGENT_CONFIGS[agentType];
  if (!config) throw new Error(`未知 Agent 类型: ${agentType}`);

  const allowedNames = new Set(config.tools);
  const { getToolDefinitions, getToolDefinitionsForAnthropic } = getTools();

  if (format === 'anthropic') {
    return getToolDefinitionsForAnthropic().filter(t => allowedNames.has(t.name));
  }
  return getToolDefinitions().filter(t => allowedNames.has(t.function.name));
}

/**
 * 从子 Agent 结果中提取干净的摘要（避免 JSON 泄漏到前端）
 * @param {string} result - 子 Agent 返回的结果文本
 * @param {number} maxLen - 最大摘要长度
 * @returns {string} 干净的中文摘要
 */
function extractCleanSummary(result, maxLen = 80) {
  if (!result) return '完成';

  // 先清理 DSML 标签、<think> 块等技术内容
  let cleaned = result
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')                    // <think>...</think>
    .replace(/<[｜|]?\s*DSML[\s\S]*?DSML\s*[｜|]?>/g, '')            // DSML 块
    .replace(/<\/?[｜|]?\s*DSML[｜|]?\s*(?:function_calls|invoke|parameter)[^>]*>/g, '') // DSML 残留标签
    .replace(/\{[\s]*"(?:name|function)"[\s]*:[\s]*"[\s\S]*?\}/g, '') // 工具调用 JSON
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleaned) return '完成';

  // 如果结果看起来像 JSON（以 { 或 [ 开头），尝试解析并提取有意义的信息
  const trimmed = cleaned.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const data = JSON.parse(trimmed);
      // 常见工具结果结构
      if (Array.isArray(data)) return `获取了 ${data.length} 条结果`;
      if (data.error) return `执行出错: ${data.error}`;
      if (data.results && Array.isArray(data.results)) return `找到 ${data.results.length} 条结果`;
      if (data.flights && Array.isArray(data.flights)) return `找到 ${data.flights.length} 个航班`;
      if (data.hotels && Array.isArray(data.hotels)) return `找到 ${data.hotels.length} 家酒店`;
      if (data.forecast) return `获取了天气预报`;
      return '已获取数据';
    } catch {
      // 不是合法 JSON，可能是混合文本，尝试跳过 JSON 部分
      return '已完成查询';
    }
  }

  // 正常文本结果，截取前 maxLen 字符
  const clean = trimmed.replace(/\n+/g, ' ').slice(0, maxLen);
  return clean.length < trimmed.length ? clean + '…' : clean;
}

/**
 * 获取工具结果的简短标签（用于 SSE 展示）
 */
function getToolLabel(funcName, resultStr) {
  try {
    const data = JSON.parse(resultStr);
    switch (funcName) {
      case 'search_flights': {
        const count = Array.isArray(data.flights) ? data.flights.length : 0;
        return `找到 ${count} 个航班`;
      }
      case 'search_hotels': {
        const count = Array.isArray(data.hotels) ? data.hotels.length : 0;
        return `找到 ${count} 家酒店`;
      }
      case 'get_exchange_rate':
        return data.rate ? `1 ${data.from} = ${data.rate} ${data.to}` : '汇率已获取';
      case 'get_weather': {
        const days = data.forecast?.length || 0;
        return `${data.city || ''} ${days}天天气`;
      }
      case 'search_poi': {
        const count = Array.isArray(data.results) ? data.results.length : 0;
        return `找到 ${count} 个地点`;
      }
      case 'web_search': {
        const count = Array.isArray(data.results) ? data.results.length : 0;
        return `找到 ${count} 条结果`;
      }
      case 'cache_destination_knowledge':
        return `已缓存 ${data.destination || ''} 知识`;
      default:
        return '已完成';
    }
  } catch {
    return '已完成';
  }
}

// ============================================================
// Provider adapters: normalize LLM request/response differences
// ============================================================

/**
 * 创建 provider adapter，统一 LLM 调用和响应格式
 */
function createProviderAdapter(provider, apiKey, baseUrl) {
  const clientOpts = { apiKey };
  if (baseUrl) clientOpts.baseURL = baseUrl;

  if (provider === 'anthropic') {
    const client = new Anthropic(clientOpts);
    return {
      defaultModel: 'claude-sonnet-4-20250514',
      toolFormat: 'anthropic',

      initMessages(systemPrompt, task) {
        // Anthropic: system is a separate param, not in messages
        return { system: systemPrompt, messages: [{ role: 'user', content: task }] };
      },

      async complete(model, system, messages, tools, maxTokens) {
        const response = await client.messages.create({
          model,
          system,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          max_tokens: maxTokens || 4096,
          temperature: 0.5,
        });
        // Normalize response
        const toolCalls = response.content
          .filter(b => b.type === 'tool_use')
          .map(b => ({ id: b.id, name: b.name, args: b.input }));
        const textContent = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('');
        return { textContent, toolCalls, rawAssistant: response.content };
      },

      pushAssistantMessage(messages, rawAssistant) {
        messages.push({ role: 'assistant', content: rawAssistant });
      },

      pushToolResults(messages, results) {
        // Anthropic: tool results go as a single user message array
        messages.push({
          role: 'user',
          content: results.map(r => ({ type: 'tool_result', tool_use_id: r.id, content: r.content }))
        });
      },
    };
  }

  // OpenAI / DeepSeek (OpenAI-compatible)
  const client = new OpenAI(clientOpts);
  return {
    defaultModel: 'gpt-4o',
    toolFormat: 'openai',

    initMessages(systemPrompt, task) {
      return {
        system: null, // embedded in messages
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: task }
        ]
      };
    },

    async complete(model, _system, messages, tools, maxTokens) {
      const hasTools = tools.length > 0;
      const stream = await client.chat.completions.create({
        model,
        messages,
        tools: hasTools ? tools : undefined,
        tool_choice: hasTools ? 'auto' : undefined,
        temperature: 0.5,
        max_tokens: maxTokens || 2048,
        stream: true,
      });

      let fullText = '';
      const toolCallsMap = {};

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;
        const delta = choice.delta;

        if (delta.content) {
          fullText += delta.content;
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

      const rawToolCalls = Object.values(toolCallsMap);
      const toolCalls = rawToolCalls.map(tc => {
        let args;
        try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
        return { id: tc.id, name: tc.function.name, args };
      });

      // 构造 rawAssistant 消息用于 message history
      const rawAssistant = {
        role: 'assistant',
        content: fullText || null,
        ...(rawToolCalls.length > 0 ? { tool_calls: rawToolCalls } : {})
      };

      return { textContent: fullText, toolCalls, rawAssistant };
    },

    pushAssistantMessage(messages, rawAssistant) {
      messages.push(rawAssistant);
    },

    pushToolResults(messages, results) {
      // OpenAI: each tool result is a separate message
      for (const r of results) {
        messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
      }
    },
  };
}

/**
 * 运行子 Agent（统一的多轮工具调用循环）
 */
async function runSubAgentLoop(agentType, task, provider, apiKey, model, sendSSE, baseUrl, agentLog) {
  const config = AGENT_CONFIGS[agentType];
  const aLog = agentLog || log.child({ agent: agentType });

  const adapter = createProviderAdapter(provider, apiKey, baseUrl);
  const selectedModel = model || adapter.defaultModel;
  const systemPrompt = config.buildPrompt();
  const tools = getToolsForAgent(agentType, adapter.toolFormat);
  const { system, messages } = adapter.initMessages(systemPrompt, task);

  for (let round = 0; round < config.maxRounds; round++) {
    aLog.debug(`子Agent轮次 ${round + 1}/${config.maxRounds}`);
    const llmTimer = aLog.startTimer('sub_llm_call');

    const { textContent, toolCalls, rawAssistant } = await adapter.complete(selectedModel, system, messages, tools, config.maxTokens);
    llmTimer.done({ toolCallCount: toolCalls.length });

    if (toolCalls.length === 0) {
      return textContent;
    }

    // 有工具调用 → 追加 assistant 消息，执行工具，追加结果
    adapter.pushAssistantMessage(messages, rawAssistant);

    // ── 限制 search_flights 调用次数，防止失控搜索 ──
    const MAX_FLIGHT_SEARCHES_PER_ROUND = 6;
    let flightSearchCount = 0;
    const cappedToolCalls = toolCalls.filter(tc => {
      if (tc.name === 'search_flights') {
        flightSearchCount++;
        if (flightSearchCount > MAX_FLIGHT_SEARCHES_PER_ROUND) {
          aLog.warn('search_flights 超限，已截断', { round: round + 1, dropped: tc.args });
          return false;
        }
      }
      return true;
    });
    if (flightSearchCount > MAX_FLIGHT_SEARCHES_PER_ROUND) {
      aLog.info(`search_flights 截断: ${flightSearchCount} → ${MAX_FLIGHT_SEARCHES_PER_ROUND}`);
    }

    // 并行执行同一轮的所有工具调用（web_search × N 等场景显著提速）
    for (const tc of cappedToolCalls) {
      sendSSE('agent_tool', { agent: agentType, tool: tc.name, args: tc.args, status: 'running' });
    }

    const toolSettled = await Promise.allSettled(cappedToolCalls.map(async (tc) => {
      const toolTimer = aLog.startTimer(`sub_tool:${tc.name}`);
      const result = await getTools().executeToolCall(tc.name, tc.args);
      let resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      // 截断过长的工具结果，避免子 Agent 消息数组内存爆炸
      if (resultStr.length > MAX_TOOL_RESULT_CHARS) {
        aLog.debug('工具结果截断', { tool: tc.name, originalLen: resultStr.length, maxLen: MAX_TOOL_RESULT_CHARS });
        resultStr = resultStr.slice(0, MAX_TOOL_RESULT_CHARS) + '\n…(结果已截断)';
      }
      const label = getToolLabel(tc.name, resultStr);
      toolTimer.done({ resultLen: resultStr.length, label });
      sendSSE('agent_tool_done', { agent: agentType, tool: tc.name, args: tc.args, label });
      return { id: tc.id, content: resultStr };
    }));

    const toolResults = toolSettled.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      const tc = cappedToolCalls[i];
      aLog.error('子Agent工具执行失败', { tool: tc.name, error: r.reason?.message });
      const errStr = `工具执行失败: ${r.reason?.message || '未知错误'}`;
      sendSSE('agent_tool_done', { agent: agentType, tool: tc.name, args: tc.args, label: '执行失败' });
      return { id: tc.id, content: errStr };
    });

    adapter.pushToolResults(messages, toolResults);

    // 为被截断的 tool_calls 补充占位结果（保持 assistant.tool_calls ↔ tool 消息对齐）
    if (cappedToolCalls.length < toolCalls.length) {
      const droppedResults = toolCalls.slice(cappedToolCalls.length).map(tc => ({
        id: tc.id,
        content: '⚠️ 已达本轮搜索次数上限，本次调用被跳过。请基于已有结果生成回复。'
      }));
      adapter.pushToolResults(messages, droppedResults);
    }
  }

  // 达到最大轮次仍有工具调用 — 追加一轮不带工具的调用让 LLM 汇总所有结果
  aLog.info('子Agent轮次已满，请求最终汇总');
  try {
    const { textContent: summary } = await adapter.complete(selectedModel, system, messages, [], config.maxTokens);
    if (summary && summary.trim()) {
      return summary;
    }
  } catch (err) {
    aLog.warn('子Agent最终汇总调用失败', { error: err.message });
  }

  // 兜底：从 messages 中提取最后一条 assistant 文本
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.trim()) {
      return msg.content;
    }
  }
  return '';
}

/**
 * 运行子 Agent（统一入口）
 * @param {string} agentType - Agent 类型
 * @param {string} task - 任务描述
 * @param {string} provider - 'openai' | 'anthropic' | 'deepseek'
 * @param {string} apiKey - API Key
 * @param {string} model - 模型名称
 * @param {Function} sendSSE - SSE 事件发送函数
 * @param {string} baseUrl - 可选的 API baseURL
 * @returns {Promise<{agent: string, status: string, data: string}>}
 */
async function runSubAgent(agentType, task, provider, apiKey, model, sendSSE, baseUrl, reqLog) {
  const agentLog = (reqLog || log).child({ agent: agentType });
  const agentTimer = agentLog.startTimer(`sub_agent:${agentType}`);
  const memBefore = process.memoryUsage();
  agentLog.info('子Agent启动', {
    task: task.slice(0, 100),
    provider,
    rssMB: Math.round(memBefore.rss / 1024 / 1024),
    heapMB: Math.round(memBefore.heapUsed / 1024 / 1024)
  });

  sendSSE('agent_start', {
    agent: agentType,
    label: AGENT_CONFIGS[agentType]?.label || agentType,
    icon: AGENT_CONFIGS[agentType]?.icon || '🔧',
    task: task.slice(0, 100)
  });

  try {
    let result = await runSubAgentLoop(agentType, task, provider, apiKey, model, sendSSE, baseUrl, agentLog);

    // 清理子 Agent 输出中可能泄露的 DSML / <think> 等技术内容
    if (result) {
      result = result
        .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
        .replace(/<[｜|]?\s*DSML[\s\S]*?DSML\s*[｜|]?>/g, '')
        .replace(/<\/?[｜|]?\s*DSML[｜|]?\s*(?:function_calls|invoke|parameter)[^>]*>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    const memAfter = process.memoryUsage();
    agentTimer.done({
      resultLen: (result || '').length,
      rssMB: Math.round(memAfter.rss / 1024 / 1024),
      heapMB: Math.round(memAfter.heapUsed / 1024 / 1024)
    });

    sendSSE('agent_done', {
      agent: agentType,
      label: AGENT_CONFIGS[agentType]?.label || agentType,
      summary: extractCleanSummary(result)
    });

    return { agent: agentType, status: 'success', data: result };
  } catch (err) {
    agentLog.error('子Agent执行失败', { error: err.message, stack: err.stack });
    sendSSE('agent_error', {
      agent: agentType,
      label: AGENT_CONFIGS[agentType]?.label || agentType,
      error: err.message
    });
    return { agent: agentType, status: 'error', error: err.message };
  }
}

module.exports = { runSubAgent, getToolsForAgent };
