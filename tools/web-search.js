/**
 * Web搜索工具 — 使用 Bing 搜索
 * Bing 对服务端 HTML 抓取较友好，返回直链 URL + 结构化结果
 * 
 * 改进版本：
 * - 添加调试日志（WEB_SEARCH_DEBUG env）
 * - 重试逻辑（指数退避）
 * - 更好的错误诊断
 */
const https = require('https');
const http = require('http');
const log = require('../utils/logger');

// 调试模式 - 通过环境变量启用
const DEBUG = process.env.WEB_SEARCH_DEBUG === 'true';

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
      if (DEBUG) console.log(`[web-search] Response status: ${res.statusCode}`);
      
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (DEBUG) console.log(`[web-search] Following redirect: ${res.headers.location}`);
        return fetch(res.headers.location, opts).then(resolve).catch(reject);
      }
      
      // 检测是否被限流
      if (res.statusCode === 429) {
        if (DEBUG) console.warn(`[web-search] Rate limited (429)`);
        reject(new Error('Bing 限流: 请求过于频繁'));
        return;
      }
      
      if (res.statusCode === 403) {
        if (DEBUG) console.warn(`[web-search] Forbidden (403)`);
        reject(new Error('Bing 拒绝: 访问被禁'));
        return;
      }
      
      if (res.statusCode >= 400) {
        if (DEBUG) console.warn(`[web-search] HTTP error: ${res.statusCode}`);
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      
      const MAX_HTML_SIZE = 512 * 1024; // 512KB 上限，避免内存爆炸
      let data = '';
      let truncated = false;
      res.on('data', c => {
        if (truncated) return;
        data += c;
        if (data.length > MAX_HTML_SIZE) {
          truncated = true;
          if (DEBUG) console.warn(`[web-search] Response truncated at ${MAX_HTML_SIZE} bytes`);
        }
      });
      res.on('end', () => {
        if (DEBUG) console.log(`[web-search] Response received: ${data.length} bytes${truncated ? ' (truncated)' : ''}`);
        resolve(data);
      });
    });
    
    req.on('error', (err) => {
      if (DEBUG) console.error(`[web-search] Request error: ${err.message}`);
      reject(err);
    });
    
    req.on('timeout', () => {
      if (DEBUG) console.error(`[web-search] Request timeout after 15s`);
      req.destroy();
      reject(new Error('请求超时（15秒）'));
    });
  });
}

/**
 * 带重试的 fetch（指数退避）
 */
async function fetchWithRetry(url, opts = {}, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, opts);
    } catch (err) {
      if (attempt === maxRetries) {
        throw err;
      }
      
      // 只在特定错误上重试
      if (!err.message.includes('ECONNREFUSED') && 
          !err.message.includes('ETIMEDOUT') &&
          !err.message.includes('超时')) {
        throw err;  // 不重试其他错误（如限流）
      }
      
      const delay = Math.pow(2, attempt - 1) * 1000;  // 1s, 2s, ...
      if (DEBUG) console.log(`[web-search] Retry attempt ${attempt}/${maxRetries} after ${delay}ms due to: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * 从 Bing HTML 中解析搜索结果
 * Bing 结构: <li class="b_algo"> 包含 <h2><a href="URL">Title</a></h2> + <p class="b_lineclamp*">Snippet</p>
 */
function parseBingResults(html) {
  const results = [];

  // 基本检查
  if (!html || html.length < 1000) {
    if (DEBUG) console.warn(`[web-search] HTML too short: ${html?.length || 0} bytes`);
    return results;
  }

  // 按 b_algo 分割出每个结果块
  const blocks = html.split(/class="b_algo"/);
  if (DEBUG) console.log(`[web-search] Found ${blocks.length - 1} potential result blocks`);
  
  // 跳过第一段（b_algo 之前的 HTML）
  for (let i = 1; i < blocks.length && results.length < 15; i++) {
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
      } catch (e) {
        if (DEBUG) console.log(`[web-search] Base64 decode failed: ${e.message}, keeping tracking URL`);
      }
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
  // 输入验证
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return JSON.stringify({ query: query || '', error: '搜索关键词不能为空', note: '请输入有效的搜索关键词' });
  }
  
  if (query.length > 500) {
    return JSON.stringify({ query: query.substring(0, 50) + '...', error: '关键词过长', note: '搜索关键词不超过500字符' });
  }

  if (DEBUG) console.log(`[web-search] Starting search - Query: "${query}", Language: ${language}`);
  
  try {
    const encoded = encodeURIComponent(query);
    const mkt = language === 'zh-CN' ? 'zh-CN' : 'en-US';
    const url = `https://www.bing.com/search?q=${encoded}&mkt=${mkt}`;
    
    if (DEBUG) console.log(`[web-search] Request URL: ${url}`);
    
    const html = await fetchWithRetry(url, { language }, 2);

    const results = parseBingResults(html);

    if (results.length === 0) {
      if (DEBUG) console.warn(`[web-search] No results parsed. HTML length: ${html.length}`);
      // 检查是否获取到了有效的 HTML
      if (html.includes('没有') || html.includes('未找到')) {
        return JSON.stringify({ query, results: [], note: '未找到结果，建议更换关键词重试' });
      }
      return JSON.stringify({ query, results: [], note: '解析失败或未找到结果，建议重试' });
    }

    if (DEBUG) console.log(`[web-search] Success: ${results.length} results found`);
    return JSON.stringify({ query, results });
  } catch (err) {
    let userNote = '搜索失败，请检查网络连接后重试';
    
    // 更详细的错误消息
    if (err.message.includes('超时')) {
      userNote = '搜索请求超时，请稍后重试';
    } else if (err.message.includes('限流')) {
      userNote = '搜索请求过于频繁，请稍后再试';
    } else if (err.message.includes('拒绝')) {
      userNote = '搜索服务暂时不可用，请稍后重试';
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
      userNote = '网络连接问题，请检查网络设置';
    }
    
    log.error('web-search 查询失败', { query, error: err.message });
    return JSON.stringify({ query, error: err.message, note: userNote });
  }
}

module.exports = { TOOL_DEF, execute };
