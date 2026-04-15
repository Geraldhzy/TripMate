/**
 * 子 Agent 配置中心
 * flight Agent — 自包含的机票搜索（含航线调研）
 * research Agent — 目的地综合调研（签证、交通、天气、美食等）
 */

const flightPrompt = require('./prompts/flight');
const researchPrompt = require('./prompts/research');

/**
 * Agent 配置表
 * - tools: 该 Agent 可用的工具名称列表
 * - buildPrompt(): 生成该 Agent 的 system prompt
 * - maxRounds: 最大工具调用轮次
 * - icon: 前端展示图标
 * - label: 中文标签
 */
const AGENT_CONFIGS = {
  flight: {
    tools: ['search_flights', 'web_search'],
    buildPrompt: flightPrompt.build,
    maxRounds: 2,
    maxTokens: 4096,
    icon: '✈️',
    label: '机票搜索'
  },
  research: {
    tools: ['web_search'],
    buildPrompt: researchPrompt.build,
    maxRounds: 1,
    maxTokens: 8192,
    icon: '📋',
    label: '目的地调研'
  }
};

module.exports = { AGENT_CONFIGS };
