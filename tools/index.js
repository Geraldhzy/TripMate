/**
 * 工具注册中心
 * 导出 OpenAI / Anthropic 两种格式的工具定义 + 统一的工具执行器
 */
const webSearch = require('./web-search');
const weather = require('./weather');
const exchangeRate = require('./exchange-rate');
const poiSearch = require('./poi-search');
const flightSearch = require('./flight-search');
const hotelSearch = require('./hotel-search');
const destKnowledge = require('./dest-knowledge');
const updateTripInfo = require('./update-trip-info');
const delegate = require('../agents/delegate');

const ALL_TOOLS = [webSearch, weather, exchangeRate, poiSearch, flightSearch, hotelSearch, destKnowledge, updateTripInfo];

// OpenAI function calling 格式（含 delegate_to_agents）
function getToolDefinitions() {
  const tools = ALL_TOOLS.map(t => ({
    type: 'function',
    function: {
      name: t.TOOL_DEF.name,
      description: t.TOOL_DEF.description,
      parameters: t.TOOL_DEF.parameters
    }
  }));
  // 添加 delegate_to_agents
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

// Anthropic tool use 格式（含 delegate_to_agents）
function getToolDefinitionsForAnthropic() {
  const tools = ALL_TOOLS.map(t => ({
    name: t.TOOL_DEF.name,
    description: t.TOOL_DEF.description,
    input_schema: t.TOOL_DEF.parameters
  }));
  // 添加 delegate_to_agents
  tools.push({
    name: delegate.TOOL_DEF.name,
    description: delegate.TOOL_DEF.description,
    input_schema: delegate.TOOL_DEF.parameters
  });
  return tools;
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

module.exports = { getToolDefinitions, getToolDefinitionsForAnthropic, executeToolCall };

const { getAllCachedDests } = require('./dest-knowledge');
module.exports.getAllCachedDests = getAllCachedDests;

const { getCachedWeather } = require('./weather');
module.exports.getCachedWeather = getCachedWeather;
