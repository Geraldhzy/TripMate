/**
 * Web搜索工具 — 使用 Brave Search API
 * 返回结构化 JSON，无需 HTML 解析，中英文搜索质量均好
 */
const https = require('https');
const log = require('../utils/logger');

const DEBUG = process.env.WEB_SEARCH_DEBUG === 'true';

// API Key 从前端设置面板传入（通过 request header → process.env._BRAVE_KEY_RUNTIME）
function getBraveApiKey() {
  return process.env._BRAVE_KEY_RUNTIME || '';
}

const TOOL_DEF = {
  name: 'web_search',
  description: '搜索互联网获取最新信息，如签证政策、景点开放时间、PADI官方信息、机票酒店参考价格等。优先搜索官方来源。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词，建议加上"官网"或"official"获取官方来源' },
      language: { type: 'string', description: '搜索语言，如 zh-CN 或 en', default: 'zh-CN' }
    },
    required: ['query']
  }
};

/**
 * 调用 Brave Search API
 */
function braveSearch(query, language = 'zh-CN', count = 10) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      q: query,
      count: String(count),
      search_lang: language === 'zh-CN' ? 'zh-hans' : 'en',
      result_filter: 'web',
    });

    const options = {
      hostname: 'api.search.brave.com',
      path: `/res/v1/web/search?${params}`,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': getBraveApiKey(),
      },
      timeout: 15000,
    };

    if (DEBUG) console.log(`[web-search] Brave API: ${options.path}`);

    const req = https.request(options, (res) => {
      if (DEBUG) console.log(`[web-search] Brave status: ${res.statusCode}`);

      // Handle gzip
      const chunks = [];
      const isGzip = (res.headers['content-encoding'] || '').includes('gzip');
      let stream = res;
      if (isGzip) {
        const zlib = require('zlib');
        stream = res.pipe(zlib.createGunzip());
      }

      stream.on('data', c => chunks.push(c));
      stream.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode !== 200) {
          if (DEBUG) console.warn(`[web-search] Brave error: ${res.statusCode} ${body.substring(0, 200)}`);
          reject(new Error(`Brave API 错误 (${res.statusCode})`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Brave API 返回格式错误'));
        }
      });
      stream.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('搜索请求超时（15秒）')); });
    req.end();
  });
}

async function execute({ query, language = 'zh-CN' }) {
  // 输入验证
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return JSON.stringify({ query: query || '', error: '搜索关键词不能为空', note: '请输入有效的搜索关键词' });
  }

  if (query.length > 500) {
    return JSON.stringify({ query: query.substring(0, 50) + '...', error: '关键词过长', note: '搜索关键词不超过500字符' });
  }

  if (DEBUG) console.log(`[web-search] Starting search - Query: "${query}", Language: ${language}`);

  const braveKey = getBraveApiKey();
  if (!braveKey) {
    return JSON.stringify({ query, error: '未配置 Brave Search API Key', note: '请在设置面板中填入 Brave Search API Key（免费申请：brave.com/search/api）' });
  }

  try {
    const data = await braveSearch(query, language);

    const webResults = data.web?.results || [];
    const results = webResults.map(r => ({
      title: r.title || '',
      url: r.url || '',
      snippet: (r.description || '').replace(/<[^>]*>/g, ''),
    }));

    if (results.length === 0) {
      if (DEBUG) console.warn(`[web-search] No results from Brave`);
      return JSON.stringify({ query, results: [], note: '未找到结果，建议更换关键词重试' });
    }

    if (DEBUG) console.log(`[web-search] Success: ${results.length} results found`);
    return JSON.stringify({ query, results });
  } catch (err) {
    let userNote = '搜索失败，请检查网络连接后重试';

    if (err.message.includes('超时')) {
      userNote = '搜索请求超时，请稍后重试';
    } else if (err.message.includes('429') || err.message.includes('限流')) {
      userNote = '搜索请求过于频繁，请稍后再试';
    } else if (err.message.includes('401') || err.message.includes('403')) {
      userNote = 'API Key 无效或已过期';
    }

    log.error('web-search 查询失败', { query, error: err.message });
    return JSON.stringify({ query, error: err.message, note: userNote });
  }
}

module.exports = { TOOL_DEF, execute };
