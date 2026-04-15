/**
 * delegate_to_agents 工具
 * 主 Agent 通过此工具并行委派任务给多个子 Agent
 */
const { runSubAgent } = require('./sub-agent-runner');
const { AGENT_CONFIGS } = require('./config');
const log = require('../utils/logger');

const TOOL_DEF = {
  name: 'delegate_to_agents',
  description: '将任务并行委派给专业Agent。支持同时委派机票搜索和目的地调研，两个Agent并行执行互不等待。flight Agent 会自行调研航线生态再搜索机票；research Agent 并行搜索签证、交通、天气、美食等信息。',
  parameters: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            agent: {
              type: 'string',
              enum: Object.keys(AGENT_CONFIGS),
              description: '目标Agent类型：flight(机票搜索，自带航线调研) | research(目的地调研，签证/交通/天气/美食等)'
            },
            task: {
              type: 'string',
              description: 'flight: 出发城市及周边机场、目的地、日期及弹性范围、人数。research: 目的地、出行时间、需要调研的主题列表。'
            }
          },
          required: ['agent', 'task']
        },
        description: '要委派的任务列表，多个任务会并行执行'
      }
    },
    required: ['tasks']
  }
};

/**
 * 执行委派（由 server.js 中的特殊路径调用，非标准工具执行器）
 * @param {Array} tasks - [{agent, task}]
 * @param {string} provider - LLM provider
 * @param {string} apiKey
 * @param {string} model
 * @param {Function} sendSSE
 * @param {string} baseUrl
 * @param {number} timeoutMs - 单个子 Agent 超时时间（默认 120 秒）
 */
async function executeDelegation(tasks, provider, apiKey, model, sendSSE, baseUrl, timeoutMs = 120000, reqLog) {
  const delLog = (reqLog || log).child({ tool: 'delegate' });

  if (!Array.isArray(tasks) || tasks.length === 0) {
    delLog.warn('空任务列表');
    return JSON.stringify({ results: [], error: '没有指定任务' });
  }

  // 验证 agent 类型
  const validTasks = tasks.filter(t => AGENT_CONFIGS[t.agent]);
  if (validTasks.length === 0) {
    delLog.warn('所有Agent类型无效', { agents: tasks.map(t => t.agent) });
    return JSON.stringify({ results: [], error: '所有指定的 Agent 类型无效' });
  }

  const batchTimer = delLog.startTimer('delegation_batch');
  delLog.info('开始并行委派', {
    taskCount: validTasks.length,
    agents: validTasks.map(t => t.agent),
    timeoutMs
  });

  sendSSE('agents_batch_start', {
    count: validTasks.length,
    agents: validTasks.map(t => ({
      agent: t.agent,
      label: AGENT_CONFIGS[t.agent].label,
      icon: AGENT_CONFIGS[t.agent].icon,
      task: t.task.slice(0, 200)
    }))
  });

  // 并行执行所有子 Agent，带超时保护
  const promises = validTasks.map(({ agent, task }) => {
    const agentPromise = runSubAgent(agent, task, provider, apiKey, model, sendSSE, baseUrl, reqLog);

    // 超时保护（agent 完成后清除 timer，避免 phantom error 事件）
    let timeoutId;
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        delLog.warn('子Agent执行超时', { agent, timeoutMs });
        sendSSE('agent_error', {
          agent,
          label: AGENT_CONFIGS[agent]?.label || agent,
          error: '执行超时'
        });
        resolve({ agent, status: 'timeout', error: `子Agent ${agent} 执行超时 (${timeoutMs / 1000}s)` });
      }, timeoutMs);
    });

    return Promise.race([agentPromise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutId);
    });
  });

  const results = await Promise.allSettled(promises);

  const formattedResults = results.map((r, i) => {
    if (r.status === 'fulfilled') {
      return r.value;
    }
    return {
      agent: validTasks[i].agent,
      status: 'error',
      error: r.reason?.message || '未知错误'
    };
  });

  const successCount = formattedResults.filter(r => r.status === 'success').length;
  const failedCount = formattedResults.length - successCount;

  sendSSE('agents_batch_done', {
    count: formattedResults.length,
    success: successCount,
    failed: failedCount
  });

  batchTimer.done({ total: formattedResults.length, success: successCount, failed: failedCount });

  // 截断过长的子 Agent 结果，避免撑爆主 Agent 上下文
  // research agent 输出较长（多主题调研），给予更大的阈值
  const MAX_RESULT_CHARS = { research: 12000 };
  const DEFAULT_MAX_CHARS = 8000;
  for (const r of formattedResults) {
    const limit = MAX_RESULT_CHARS[r.agent] || DEFAULT_MAX_CHARS;
    if (r.data && r.data.length > limit) {
      delLog.debug('子Agent结果截断', { agent: r.agent, originalLen: r.data.length, maxLen: limit });
      r.data = r.data.slice(0, limit) + '\n\n…（结果过长，已截断。关键信息已包含在上方内容中）';
    }
  }

  // 注入 coveredTopics：明确告知主Agent哪些主题已被子Agent覆盖，禁止重复搜索
  const AGENT_COVERED_TOPICS = {
    flight: ['航班搜索', '航线调研', '机票报价', '航空公司对比'],
    research: ['签证政策', '城际交通', '天气气候', '特色活动', '美食推荐']
  };
  const coveredTopics = [];
  for (const r of formattedResults) {
    if (r.status === 'success' && AGENT_COVERED_TOPICS[r.agent]) {
      coveredTopics.push(...AGENT_COVERED_TOPICS[r.agent]);
    }
  }

  return JSON.stringify({
    results: formattedResults,
    coveredTopics,
    _instruction: '以上主题已由子Agent完成调研，主Agent禁止再用 web_search 重复搜索这些主题。直接采纳子Agent结果即可。'
  });
}

module.exports = { TOOL_DEF, executeDelegation };
