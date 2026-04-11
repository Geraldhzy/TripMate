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
const ALL_TOOLS = [webSearch, weather, exchangeRate, poiSearch, flightSearch, hotelSearch, destKnowledge, updateTripInfo];

// OpenAI function calling 格式
function getToolDefinitions() {
  return ALL_TOOLS.map(t => ({
    type: 'function',
    function: {
      name: t.TOOL_DEF.name,
      description: t.TOOL_DEF.description,
      parameters: t.TOOL_DEF.parameters
    }
  }));
}

// Anthropic tool use 格式
function getToolDefinitionsForAnthropic() {
  return ALL_TOOLS.map(t => ({
    name: t.TOOL_DEF.name,
    description: t.TOOL_DEF.description,
    input_schema: t.TOOL_DEF.parameters
  }));
}

// 统一工具执行器
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
