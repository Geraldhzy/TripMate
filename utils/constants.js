/**
 * Shared constants used across server and sub-agent runner
 */
const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  deepseek: 'deepseek-chat',
  kimi: 'moonshot-v1-auto',
  glm: 'glm-4-plus',
  minimax: 'MiniMax-Text-01',
};

module.exports = { DEFAULT_MODELS };
