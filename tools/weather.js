/**
 * 天气查询工具 — 使用 wttr.in（免费无需Key）
 * 服务端内存 TTL 缓存：3小时，防止重复打外部 API
 */
const https = require('https');

const CACHE_TTL = 3 * 60 * 60 * 1000; // 3 小时
const weatherCache = new Map(); // key: "city" → { data, expires_at }

const TOOL_DEF = {
  name: 'get_weather',
  description: '查询指定城市的天气预报（未来3天），用于辅助行程安排（如雨天安排室内活动）。',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名（英文），如 Kuala Lumpur, Kota Kinabalu, Semporna' },
      date: { type: 'string', description: '可选，查询特定日期 YYYY-MM-DD。不传则返回未来3天' }
    },
    required: ['city']
  }
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'curl/7.68.0', 'Accept': 'application/json' },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('天气数据解析失败')); }
      });
    }).on('error', reject)
      .on('timeout', function() { this.destroy(); reject(new Error('请求超时')); });
  });
}

async function execute({ city, date }) {
  const cityKey = city.toLowerCase().trim();

  // 命中服务端缓存
  const cached = weatherCache.get(cityKey);
  if (cached && cached.expires_at > Date.now()) {
    const result = { ...cached.data, from_cache: true };
    // 如果指定了日期，过滤只返回该天
    if (date) {
      result.forecast = result.forecast.filter(d => d.date === date);
    }
    return JSON.stringify(result);
  }

  try {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    const data = await fetchJSON(url);

    const current = data.current_condition?.[0];
    const forecast = data.weather || [];

    const now = Date.now();
    const result = {
      city,
      current: current ? {
        temp_c: current.temp_C,
        feels_like_c: current.FeelsLikeC,
        humidity: current.humidity + '%',
        description: current.weatherDesc?.[0]?.value || '',
        wind_kmh: current.windspeedKmph
      } : null,
      forecast: forecast.map(day => ({
        date: day.date,
        max_temp_c: day.maxtempC,
        min_temp_c: day.mintempC,
        avg_humidity: day.hourly?.reduce((s, h) => s + parseInt(h.humidity), 0) / (day.hourly?.length || 1) | 0,
        description: day.hourly?.[4]?.weatherDesc?.[0]?.value || '',
        rain_chance: day.hourly?.[4]?.chanceofrain || '0',
        sunrise: day.astronomy?.[0]?.sunrise,
        sunset: day.astronomy?.[0]?.sunset
      })),
      fetched_at: now
    };

    // 存入缓存
    weatherCache.set(cityKey, { data: result, expires_at: now + CACHE_TTL });

    // 如果指定了日期，过滤只返回该天
    const output = { ...result };
    if (date) {
      output.forecast = output.forecast.filter(d => d.date === date);
    }

    return JSON.stringify(output);
  } catch (err) {
    return JSON.stringify({ city, error: err.message });
  }
}

/** 返回服务端内存中所有未过期的天气数据，供系统提示注入 */
function getCachedWeather() {
  const now = Date.now();
  const fresh = [];
  for (const [, entry] of weatherCache) {
    if (entry.expires_at > now) fresh.push(entry.data);
  }
  return fresh;
}

module.exports = { TOOL_DEF, execute, getCachedWeather };
