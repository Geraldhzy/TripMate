/**
 * 汇率查询工具 — 使用 open.er-api.com（免费无需Key）
 * 服务端内存 TTL 缓存：4小时，防止重复打外部 API
 */
const https = require('https');

const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 小时
const rateCache = new Map(); // key: "USD_CNY" → { data, expires_at }

const TOOL_DEF = {
  name: 'get_exchange_rate',
  description: '查询实时汇率。用于将机票、酒店等外币价格转换为人民币CNY，或将用户预算在不同货币间换算。',
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string', description: '源货币代码，如 USD, MYR, EUR' },
      to: { type: 'string', description: '目标货币代码，如 CNY', default: 'CNY' },
      amount: { type: 'number', description: '可选，要转换的金额。不传则只返回汇率。' }
    },
    required: ['from']
  }
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('汇率数据解析失败')); }
      });
    }).on('error', reject)
      .on('timeout', function() { this.destroy(); reject(new Error('请求超时')); });
  });
}

async function execute({ from, to = 'CNY', amount }) {
  const fromUpper = from.toUpperCase();
  const toUpper = to.toUpperCase();
  const key = `${fromUpper}_${toUpper}`;

  // 命中服务端缓存
  const cached = rateCache.get(key);
  if (cached && cached.expires_at > Date.now()) {
    const result = { ...cached.data, from_cache: true };
    if (amount !== undefined) {
      result.amount = amount;
      result.converted = Math.round(amount * result.rate * 100) / 100;
      result.display = `${amount} ${fromUpper} = ${result.converted} ${toUpper}`;
    }
    return JSON.stringify(result);
  }

  try {
    const url = `https://open.er-api.com/v6/latest/${fromUpper}`;
    const data = await fetchJSON(url);

    if (data.result !== 'success') {
      return JSON.stringify({ error: '汇率查询失败: ' + (data['error-type'] || '未知错误') });
    }

    const rate = data.rates[toUpper];
    if (!rate) {
      return JSON.stringify({ error: `不支持的货币代码: ${to}` });
    }

    const now = Date.now();
    const result = {
      from: fromUpper,
      to: toUpper,
      rate,
      last_updated: data.time_last_update_utc,
      fetched_at: now   // 毫秒时间戳，供客户端 TTL 判断
    };

    rateCache.set(key, { data: result, expires_at: now + CACHE_TTL });

    if (amount !== undefined) {
      result.amount = amount;
      result.converted = Math.round(amount * rate * 100) / 100;
      result.display = `${amount} ${fromUpper} = ${result.converted} ${toUpper}`;
    }

    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}

/** 返回服务端内存中所有未过期的汇率，供系统提示注入 */
function getCachedRates() {
  const now = Date.now();
  const fresh = [];
  for (const [, entry] of rateCache) {
    if (entry.expires_at > now) fresh.push(entry.data);
  }
  return fresh;
}

module.exports = { TOOL_DEF, execute, getCachedRates };

