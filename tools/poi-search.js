/**
 * POI搜索工具 — 使用 Overpass API (OpenStreetMap，免费无需Key)
 */
const https = require('https');

const TOOL_DEF = {
  name: 'search_poi',
  description: '搜索地点信息，如餐厅、景点、ATM、潜水店等。返回名称、地址、坐标、评分等信息。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词，如"Semporna dive shop"、"Kuala Lumpur restaurant"' },
      location: { type: 'string', description: '地点名称（英文），如 Kuala Lumpur, Semporna' },
      category: { type: 'string', description: '类别：restaurant, attraction, hotel, atm, dive_shop, cafe, shopping', default: 'attraction' }
    },
    required: ['query', 'location']
  }
};

// 用 Nominatim 做地理编码
function geocode(location) {
  return new Promise((resolve, reject) => {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
    https.get(url, {
      headers: { 'User-Agent': 'AITravelPlanner/1.0' },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const results = JSON.parse(data);
          if (results.length > 0) {
            resolve({ lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) });
          } else {
            reject(new Error(`无法定位: ${location}`));
          }
        } catch { reject(new Error('地理编码解析失败')); }
      });
    }).on('error', reject);
  });
}

// Overpass 查询
function overpassQuery(lat, lon, category, radius = 5000) {
  const categoryMap = {
    restaurant: '["amenity"="restaurant"]',
    cafe: '["amenity"="cafe"]',
    attraction: '["tourism"~"attraction|museum|viewpoint"]',
    hotel: '["tourism"~"hotel|guest_house|hostel"]',
    atm: '["amenity"="atm"]',
    dive_shop: '["sport"="scuba_diving"]',
    shopping: '["shop"~"mall|supermarket|department_store"]'
  };

  const filter = categoryMap[category] || '["tourism"="attraction"]';
  const query = `[out:json][timeout:10];(node${filter}(around:${radius},${lat},${lon});way${filter}(around:${radius},${lat},${lon}););out center 10;`;

  return new Promise((resolve, reject) => {
    const postData = `data=${encodeURIComponent(query)}`;
    const options = {
      hostname: 'overpass-api.de',
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('POI数据解析失败')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(postData);
    req.end();
  });
}

async function execute({ query, location, category = 'attraction' }) {
  try {
    const coords = await geocode(location);
    const data = await overpassQuery(coords.lat, coords.lon, category);

    const pois = (data.elements || []).map(el => {
      const tags = el.tags || {};
      return {
        name: tags.name || tags['name:en'] || tags['name:zh'] || '未命名',
        lat: el.lat || el.center?.lat,
        lon: el.lon || el.center?.lon,
        category: category,
        address: tags['addr:full'] || tags['addr:street'] || '',
        phone: tags.phone || '',
        website: tags.website || '',
        opening_hours: tags.opening_hours || ''
      };
    }).filter(p => p.name !== '未命名');

    // 按名称匹配度排序（简单关键词匹配）
    const keywords = query.toLowerCase().split(/\s+/);
    pois.sort((a, b) => {
      const scoreA = keywords.filter(k => a.name.toLowerCase().includes(k)).length;
      const scoreB = keywords.filter(k => b.name.toLowerCase().includes(k)).length;
      return scoreB - scoreA;
    });

    return JSON.stringify({
      query,
      location,
      center: coords,
      results: pois.slice(0, 10)
    });
  } catch (err) {
    return JSON.stringify({ query, location, error: err.message });
  }
}

module.exports = { TOOL_DEF, execute };
