/**
 * 天气查询工具 — 使用 Open-Meteo（免费无需Key）
 * 支持未来16天天气预报；超过16天返回去年同期气候参考
 * 服务端内存 TTL 缓存：3小时
 */
const https = require('https');

const CACHE_TTL = 3 * 60 * 60 * 1000; // 3 小时
const weatherCache = new Map();

const TOOL_DEF = {
  name: 'get_weather',
  description: '查询指定城市在指定日期范围的天气预报（最多未来16天）。超过16天则返回历史同期气候参考。必须传入出行日期范围，不要查当前天气。',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名（英文），如 Tokyo, Paris, Kuala Lumpur' },
      start_date: { type: 'string', description: '开始日期 YYYY-MM-DD（用户出行的起始日期）' },
      end_date: { type: 'string', description: '结束日期 YYYY-MM-DD（用户出行的结束日期）' }
    },
    required: ['city', 'start_date', 'end_date']
  }
};

// WMO Weather Code → 中文描述
const WMO_DESCRIPTIONS = {
  0: '晴天', 1: '大部晴朗', 2: '多云', 3: '阴天',
  45: '雾', 48: '雾凇',
  51: '小毛毛雨', 53: '中毛毛雨', 55: '大毛毛雨',
  56: '冻毛毛雨', 57: '冻毛毛雨（大）',
  61: '小雨', 63: '中雨', 65: '大雨',
  66: '冻雨（小）', 67: '冻雨（大）',
  71: '小雪', 73: '中雪', 75: '大雪',
  77: '雪粒', 80: '阵雨（小）', 81: '阵雨（中）', 82: '阵雨（大）',
  85: '阵雪（小）', 86: '阵雪（大）',
  95: '雷暴', 96: '雷暴伴小冰雹', 99: '雷暴伴大冰雹'
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'ai-travel-planner/1.0', 'Accept': 'application/json' },
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

/**
 * 通过 Open-Meteo Geocoding API 将城市名转为经纬度
 */
async function geocodeCity(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`;
  const data = await fetchJSON(url);
  if (!data.results || data.results.length === 0) {
    throw new Error(`找不到城市: ${city}`);
  }
  const r = data.results[0];
  return { lat: r.latitude, lon: r.longitude, name: r.name, timezone: r.timezone };
}

/**
 * 解析 Open-Meteo daily 数据为统一格式
 */
function parseDailyData(daily, isClimateRef = false) {
  const days = [];
  const dates = daily.time || [];
  for (let i = 0; i < dates.length; i++) {
    days.push({
      date: dates[i],
      max_temp_c: daily.temperature_2m_max?.[i],
      min_temp_c: daily.temperature_2m_min?.[i],
      rain_probability: daily.precipitation_probability_max?.[i] ?? null,
      precipitation_mm: daily.precipitation_sum?.[i] ?? null,
      description: WMO_DESCRIPTIONS[daily.weathercode?.[i]] || '未知',
      sunrise: daily.sunrise?.[i]?.split('T')[1] || null,
      sunset: daily.sunset?.[i]?.split('T')[1] || null,
      ...(isClimateRef && { is_climate_reference: true })
    });
  }
  return days;
}

async function execute({ city, start_date, end_date }) {
  // 兼容旧的单日期调用方式
  if (!start_date && !end_date) {
    // 无日期时返回未来 7 天
    const today = new Date();
    start_date = today.toISOString().split('T')[0];
    const future = new Date(today);
    future.setDate(future.getDate() + 6);
    end_date = future.toISOString().split('T')[0];
  }
  if (start_date && !end_date) end_date = start_date;

  const cacheKey = `${city.toLowerCase().trim()}_${start_date}_${end_date}`;

  // 命中缓存
  const cached = weatherCache.get(cacheKey);
  if (cached && cached.expires_at > Date.now()) {
    return JSON.stringify({ ...cached.data, from_cache: true });
  }

  try {
    // 1. 城市名 → 经纬度
    const geo = await geocodeCity(city);

    // 2. 判断日期是否在预报范围内（未来 16 天）
    const now = new Date();
    const startD = new Date(start_date);
    const endD = new Date(end_date);
    const daysFromNow = Math.ceil((endD - now) / (24 * 60 * 60 * 1000));

    let forecast = [];
    let dataType = 'forecast';

    if (daysFromNow <= 16) {
      // 未来 16 天内：使用 Forecast API
      const forecastStart = startD < now ? now.toISOString().split('T')[0] : start_date;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weathercode,sunrise,sunset` +
        `&start_date=${forecastStart}&end_date=${end_date}&timezone=auto`;
      const data = await fetchJSON(url);
      if (data.error) throw new Error(data.reason || '预报请求失败');
      forecast = parseDailyData(data.daily, false);
    } else {
      // 超出 16 天：使用去年同期历史数据作为气候参考
      dataType = 'climate_reference';
      const lastYear = new Date(startD);
      lastYear.setFullYear(lastYear.getFullYear() - 1);
      const lastYearEnd = new Date(endD);
      lastYearEnd.setFullYear(lastYearEnd.getFullYear() - 1);

      const histStart = lastYear.toISOString().split('T')[0];
      const histEnd = lastYearEnd.toISOString().split('T')[0];

      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${geo.lat}&longitude=${geo.lon}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,sunrise,sunset` +
        `&start_date=${histStart}&end_date=${histEnd}&timezone=auto`;
      const data = await fetchJSON(url);
      if (data.error) throw new Error(data.reason || '历史数据请求失败');
      forecast = parseDailyData(data.daily, true);

      // 将去年日期映射回今年日期
      const yearDiff = startD.getFullYear() - lastYear.getFullYear();
      forecast = forecast.map(day => ({
        ...day,
        date: day.date.replace(/^\d{4}/, String(parseInt(day.date.substring(0, 4)) + yearDiff))
      }));
    }

    const result = {
      city,
      city_local: geo.name,
      query_range: { start: start_date, end: end_date },
      data_type: dataType,
      ...(dataType === 'climate_reference' && {
        notice: '出行日期超出16天预报范围，以下为去年同期气候数据，仅供参考，非精确预报'
      }),
      forecast,
      fetched_at: Date.now()
    };

    // 存入缓存
    weatherCache.set(cacheKey, { data: result, expires_at: Date.now() + CACHE_TTL });

    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ city, error: err.message });
  }
}

/** 返回服务端内存中所有未过期的天气数据 */
function getCachedWeather() {
  const now = Date.now();
  const fresh = [];
  for (const [, entry] of weatherCache) {
    if (entry.expires_at > now) fresh.push(entry.data);
  }
  return fresh;
}

module.exports = { TOOL_DEF, execute, getCachedWeather };
