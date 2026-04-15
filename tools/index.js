/**
 * 工具注册中心
 * 导出 OpenAI function calling 格式的工具定义 + 统一的工具执行器
 */
const webSearch = require('./web-search');
const poiSearch = require('./poi-search');
const flightSearch = require('./flight-search');
const hotelSearch = require('./hotel-search');
const updateTripInfo = require('./update-trip-info');
const delegate = require('../agents/delegate');

const ALL_TOOLS = [webSearch, poiSearch, flightSearch, hotelSearch, updateTripInfo];

// OpenAI function calling 格式（含 delegate_to_agents）— 子 Agent 选取工具时使用
function getToolDefinitions() {
  const tools = ALL_TOOLS.map(t => ({
    type: 'function',
    function: {
      name: t.TOOL_DEF.name,
      description: t.TOOL_DEF.description,
      parameters: t.TOOL_DEF.parameters
    }
  }));
  tools.push({
    type: 'function',
    function: {
      name: delegate.TOOL_DEF.name,
      description: delegate.TOOL_DEF.description,
      parameters: delegate.TOOL_DEF.parameters
    }
  });
  return tools;
}

// 主 Agent 专属工具列表：排除子 Agent 独占工具（search_flights）
// search_flights 由 flight 子 Agent 独占使用，主 Agent 必须通过 delegate_to_agents 委派
const SUB_AGENT_EXCLUSIVE_TOOLS = new Set(['search_flights']);

function getMainAgentToolDefinitions() {
  return getToolDefinitions().filter(
    t => !SUB_AGENT_EXCLUSIVE_TOOLS.has(t.function.name)
  );
}

// 统一工具执行器（不含 delegate_to_agents，该工具由 server.js 特殊处理）
const toolMap = {};
ALL_TOOLS.forEach(t => { toolMap[t.TOOL_DEF.name] = t.execute; });

async function executeToolCall(name, args) {
  const handler = toolMap[name];
  if (!handler) {
    throw new Error(`未知工具: ${name}`);
  }
  return handler(args);
}

module.exports = { getToolDefinitions, getMainAgentToolDefinitions, executeToolCall, SUB_AGENT_EXCLUSIVE_TOOLS };
