/**
 * delegate_to_agents 工具
 * 主 Agent 通过此工具并行委派任务给多个子 Agent
 */
const { runSubAgent } = require('./sub-agent-runner');
const { AGENT_CONFIGS } = require('./config');
const log = require('../utils/logger');

const TOOL_DEF = {
  name: 'delegate_to_agents',
  description: '将任务委派给专业子Agent并行执行。可同时委派多个不同领域的任务，子Agent会并行工作以提高效率。每个子Agent专精一个领域，拥有该领域的专用工具。',
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
              description: '目标Agent类型：transport(交通/机票)、food(餐饮)、hotel(住宿)、attractions(景点)、knowledge(签证/天气/目的地百科)'
            },
            task: {
              type: 'string',
              description: '具体任务描述，必须包含所有必要上下文（目的地、日期、人数、偏好等），子Agent无法看到主对话历史'
            }
          },
          required: ['agent', 'task']
        },
        description: '要委派的任务列表，不同Agent可并行执行'
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
 * @param {number} timeoutMs - 单个子 Agent 超时时间（默认 60 秒）
 */
async function executeDelegation(tasks, provider, apiKey, model, sendSSE, baseUrl, timeoutMs = 60000, reqLog) {
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
      icon: AGENT_CONFIGS[t.agent].icon
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

  sendSSE('agents_batch_done', {
    count: formattedResults.length,
    success: formattedResults.filter(r => r.status === 'success').length,
    failed: formattedResults.filter(r => r.status !== 'success').length
  });

  const successCount = formattedResults.filter(r => r.status === 'success').length;
  const failedCount = formattedResults.filter(r => r.status !== 'success').length;
  batchTimer.done({ total: formattedResults.length, success: successCount, failed: failedCount });

  // 截断过长的子 Agent 结果，避免撑爆主 Agent 上下文
  const MAX_RESULT_CHARS = 4000;
  for (const r of formattedResults) {
    if (r.data && r.data.length > MAX_RESULT_CHARS) {
      delLog.debug('子Agent结果截断', { agent: r.agent, originalLen: r.data.length, maxLen: MAX_RESULT_CHARS });
      r.data = r.data.slice(0, MAX_RESULT_CHARS) + '\n\n…（结果过长，已截断。关键信息已包含在上方内容中）';
    }
  }

  return JSON.stringify({ results: formattedResults });
}

module.exports = { TOOL_DEF, executeDelegation };
