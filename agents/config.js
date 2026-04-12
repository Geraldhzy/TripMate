/**
 * 子 Agent 配置中心
 * 定义每个子 Agent 的工具集、prompt 构建器、最大轮次、展示信息
 */

const transportPrompt = require('./prompts/transport');
const foodPrompt = require('./prompts/food');
const hotelPrompt = require('./prompts/hotel');
const attractionsPrompt = require('./prompts/attractions');
const knowledgePrompt = require('./prompts/knowledge');

/**
 * Agent 配置表
 * - tools: 该 Agent 可用的工具名称列表
 * - buildPrompt(tripBook): 生成该 Agent 的 system prompt
 * - maxRounds: 最大工具调用轮次
 * - icon: 前端展示图标
 * - label: 中文标签
 */
const AGENT_CONFIGS = {
  transport: {
    tools: ['search_flights', 'get_exchange_rate', 'web_search'],
    buildPrompt: transportPrompt.build,
    maxRounds: 3,
    icon: '✈️',
    label: '机票交通'
  },
  food: {
    tools: ['search_poi', 'web_search'],
    buildPrompt: foodPrompt.build,
    maxRounds: 3,
    icon: '🍜',
    label: '美食餐饮'
  },
  hotel: {
    tools: ['search_hotels', 'search_poi', 'get_exchange_rate', 'web_search'],
    buildPrompt: hotelPrompt.build,
    maxRounds: 3,
    icon: '🏨',
    label: '酒店住宿'
  },
  attractions: {
    tools: ['search_poi', 'web_search'],
    buildPrompt: attractionsPrompt.build,
    maxRounds: 3,
    icon: '🏛️',
    label: '景点玩乐'
  },
  knowledge: {
    tools: ['web_search', 'get_weather', 'cache_destination_knowledge'],
    buildPrompt: knowledgePrompt.build,
    maxRounds: 3,
    icon: '📚',
    label: '目的地百科'
  }
};

module.exports = { AGENT_CONFIGS };
