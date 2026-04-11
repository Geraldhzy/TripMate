/**
 * Web搜索工具 — 使用 Bing 搜索
 * Bing 对服务端 HTML 抓取较友好，返回直链 URL + 结构化结果
 */
const https = require('https');
const http = require('http');

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

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': opts.language || 'zh-CN,zh;q=0.9,en;q=0.8',
        ...opts.headers
      },
      timeout: 15000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location, opts).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
  });
}

/**
 * 从 Bing HTML 中解析搜索结果
 * Bing 结构: <li class="b_algo"> 包含 <h2><a href="URL">Title</a></h2> + <p class="b_lineclamp*">Snippet</p>
 */
function parseBingResults(html) {
  const results = [];

  // 按 b_algo 分割出每个结果块
  const blocks = html.split(/class="b_algo"/);
  // 跳过第一段（b_algo 之前的 HTML）
  for (let i = 1; i < blocks.length && results.length < 8; i++) {
    const block = blocks[i];

    // 提取标题和 URL: <h2...><a ... href="URL">Title</a></h2>
    const titleMatch = block.match(/<h2[^>]*><a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a><\/h2>/);
    if (!titleMatch) continue;

    let url = titleMatch[1];
    const title = titleMatch[2].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim();
    if (!title) continue;

    // 解码 Bing tracking URL (u=a1<base64>) 如果存在
    const trackMatch = url.match(/u=a1([A-Za-z0-9_-]+)/);
    if (trackMatch) {
      try {
        let b64 = trackMatch[1].replace(/-/g, '+').replace(/_/g, '/');
        const mod = b64.length % 4;
        if (mod === 2) b64 += '==';
        else if (mod === 3) b64 += '=';
        url = Buffer.from(b64, 'base64').toString('utf-8');
      } catch {}
    }

    // 解码 HTML entities in URL
    url = url.replace(/&amp;/g, '&');

    // 提取摘要: <p class="b_lineclamp...">...</p>
    let snippet = '';
    const snippetMatch = block.match(/<p class="b_lineclamp[^"]*">([\s\S]*?)(?:<\/p>|$)/);
    if (snippetMatch) {
      snippet = snippetMatch[1]
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&ensp;/g, ' ')
        .replace(/&#\d+;/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();
    }

    // 过滤掉非 http URL
    if (!url.startsWith('http')) continue;

    results.push({ title, url, snippet });
  }

  return results;
}

async function execute({ query, language = 'zh-CN' }) {
  try {
    const encoded = encodeURIComponent(query);
    const mkt = language === 'zh-CN' ? 'zh-CN' : 'en-US';
    const url = `https://www.bing.com/search?q=${encoded}&mkt=${mkt}`;
    const html = await fetch(url, { language });

    const results = parseBingResults(html);

    if (results.length === 0) {
      return JSON.stringify({ query, results: [], note: '未找到结果，建议更换关键词重试' });
    }

    return JSON.stringify({ query, results });
  } catch (err) {
    return JSON.stringify({ query, error: err.message, note: '搜索失败，可尝试更换关键词' });
  }
}

module.exports = { TOOL_DEF, execute };
