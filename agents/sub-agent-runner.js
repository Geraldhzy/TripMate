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

// 单个工具结果的最大字符数（避免子 Agent 消息数组内存爆炸）
const MAX_TOOL_RESULT_CHARS = 8000;

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

  // 如果结果看起来像 JSON（以 { 或 [ 开头），尝试解析并提取有意义的信息
  const trimmed = result.trim();
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

/**
 * 运行子 Agent (OpenAI 格式)
 */
async function runSubAgentOpenAI(agentType, task, apiKey, model, sendSSE, baseUrl, agentLog) {
  const config = AGENT_CONFIGS[agentType];
  const aLog = agentLog || log.child({ agent: agentType });
  const systemPrompt = config.buildPrompt();
  const tools = getToolsForAgent(agentType, 'openai');

  const clientOpts = { apiKey };
  if (baseUrl) clientOpts.baseURL = baseUrl;
  const client = new OpenAI(clientOpts);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task }
  ];

  // 子 Agent 不做流式（不需要逐 token 展示给用户）
  const selectedModel = model || 'gpt-4o';

  for (let round = 0; round < config.maxRounds; round++) {
    aLog.debug(`子Agent轮次 ${round + 1}/${config.maxRounds}`);
    const llmTimer = aLog.startTimer('sub_llm_call');
    const response = await client.chat.completions.create({
      model: selectedModel,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: 0.5,
      max_tokens: 2048,
    });

    const choice = response.choices[0];
    const toolCalls = choice.message.tool_calls || [];
    llmTimer.done({ toolCallCount: toolCalls.length });

    if (toolCalls.length > 0) {
      // 追加 assistant 消息
      messages.push(choice.message);

      for (const tc of toolCalls) {
        const funcName = tc.function.name;
        let funcArgs;
        try { funcArgs = JSON.parse(tc.function.arguments); } catch { funcArgs = {}; }

        sendSSE('agent_tool', { agent: agentType, tool: funcName, status: 'running' });

        try {
          const toolTimer = aLog.startTimer(`sub_tool:${funcName}`);
          const result = await getTools().executeToolCall(funcName, funcArgs);
          let resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          // 截断过长的工具结果，避免子 Agent 消息数组内存爆炸
          if (resultStr.length > MAX_TOOL_RESULT_CHARS) {
            aLog.debug('工具结果截断', { tool: funcName, originalLen: resultStr.length, maxLen: MAX_TOOL_RESULT_CHARS });
            resultStr = resultStr.slice(0, MAX_TOOL_RESULT_CHARS) + '\n…(结果已截断)';
          }
          const label = getToolLabel(funcName, resultStr);
          toolTimer.done({ resultLen: resultStr.length, label });

          sendSSE('agent_tool_done', { agent: agentType, tool: funcName, label });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: resultStr });
        } catch (err) {
          aLog.error('子Agent工具执行失败', { tool: funcName, error: err.message });
          const errStr = `工具执行失败: ${err.message}`;
          sendSSE('agent_tool_done', { agent: agentType, tool: funcName, label: '执行失败' });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: errStr });
        }
      }
      continue;
    }

    // 无工具调用 → 返回最终结果
    return choice.message.content || '';
  }

  // 达到最大轮次仍有工具调用，返回最后一轮的文本
  return messages[messages.length - 1]?.content || '';
}

/**
 * 运行子 Agent (Anthropic 格式)
 */
async function runSubAgentAnthropic(agentType, task, apiKey, model, sendSSE, baseUrl, agentLog) {
  const config = AGENT_CONFIGS[agentType];
  const aLog = agentLog || log.child({ agent: agentType });
  const systemPrompt = config.buildPrompt();
  const tools = getToolsForAgent(agentType, 'anthropic');

  const clientOpts = { apiKey };
  if (baseUrl) clientOpts.baseURL = baseUrl;
  const client = new Anthropic(clientOpts);

  const messages = [{ role: 'user', content: task }];
  const selectedModel = model || 'claude-sonnet-4-20250514';

  for (let round = 0; round < config.maxRounds; round++) {
    aLog.debug(`子Agent轮次 ${round + 1}/${config.maxRounds}`);
    const llmTimer = aLog.startTimer('sub_llm_call');
    const response = await client.messages.create({
      model: selectedModel,
      system: systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: 2048,
      temperature: 0.5,
    });

    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    llmTimer.done({ toolCallCount: toolUseBlocks.length });

    if (toolUseBlocks.length > 0) {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        sendSSE('agent_tool', { agent: agentType, tool: toolUse.name, status: 'running' });

        try {
          const toolTimer = aLog.startTimer(`sub_tool:${toolUse.name}`);
          const result = await getTools().executeToolCall(toolUse.name, toolUse.input);
          let resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          // 截断过长的工具结果
          if (resultStr.length > MAX_TOOL_RESULT_CHARS) {
            aLog.debug('工具结果截断', { tool: toolUse.name, originalLen: resultStr.length, maxLen: MAX_TOOL_RESULT_CHARS });
            resultStr = resultStr.slice(0, MAX_TOOL_RESULT_CHARS) + '\n…(结果已截断)';
          }
          const label = getToolLabel(toolUse.name, resultStr);
          toolTimer.done({ resultLen: resultStr.length, label });

          sendSSE('agent_tool_done', { agent: agentType, tool: toolUse.name, label });
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: resultStr });
        } catch (err) {
          aLog.error('子Agent工具执行失败', { tool: funcName, error: err.message });
          const errStr = `工具执行失败: ${err.message}`;
          sendSSE('agent_tool_done', { agent: agentType, tool: toolUse.name, label: '执行失败' });
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: errStr });
        }
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // 无工具调用 → 返回文本
    const textBlocks = response.content.filter(b => b.type === 'text');
    return textBlocks.map(b => b.text).join('');
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
    let result;
    if (provider === 'anthropic') {
      result = await runSubAgentAnthropic(agentType, task, apiKey, model, sendSSE, baseUrl, agentLog);
    } else {
      // OpenAI and DeepSeek (OpenAI-compatible) both use OpenAI format
      result = await runSubAgentOpenAI(agentType, task, apiKey, model, sendSSE, baseUrl, agentLog);
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
