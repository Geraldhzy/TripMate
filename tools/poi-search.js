/**
 * POI搜索工具 — 封装 web_search 搜索地点信息
 * 由于搜索引擎在部分网络环境下不稳定，此工具做了多次重试和查询优化
 */
const { execute: webSearch } = require('./web-search');

const TOOL_DEF = {
  name: 'search_poi',
  description: '搜索地点信息，如餐厅、景点、ATM、潜水店等。返回名称、地址、简介等信息。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词，如"Semporna dive shop"、"浅草寺 门票 开放时间"' },
      location: { type: 'string', description: '地点名称，如 Kuala Lumpur, 东京, Semporna' },
      category: { type: 'string', description: '类别：restaurant, attraction, hotel, atm, dive_shop, cafe, shopping', default: 'attraction' }
    },
    required: ['query', 'location']
  }
};

async function execute({ query, location, category = 'attraction' }) {
  // 尝试多种查询策略
  const queries = [
    `${location} ${query} guide tips`,          // 英文通用
    `${query} ${location} 攻略 推荐`,            // 中文
    `${location} ${query} travel information`,   // 英文备用
  ];

  for (const searchQuery of queries) {
    try {
      const lang = /[\u4e00-\u9fff]/.test(searchQuery) ? 'zh-CN' : 'en';
      const rawResult = await webSearch({ query: searchQuery, language: lang });
      const parsed = JSON.parse(rawResult);

      if (parsed.results && parsed.results.length > 0) {
        // 过滤明显不相关的结果（标题中完全不包含 query 或 location 的任何词）
        const queryWords = `${query} ${location}`.toLowerCase().split(/\s+/).filter(w => w.length > 1);
        const relevant = parsed.results.filter(r => {
          const title = (r.title || '').toLowerCase();
          const snippet = (r.snippet || '').toLowerCase();
          const text = title + ' ' + snippet;
          return queryWords.some(w => text.includes(w));
        });

        if (relevant.length > 0) {
          return JSON.stringify({
            query, location, category,
            results: relevant.map(r => ({
              name: r.title || '',
              url: r.url || '',
              snippet: r.snippet || '',
              category
            })),
            source: 'web_search'
          });
        }
      }
    } catch {
      // 继续尝试下一个查询
    }
  }

  // 所有查询都失败
  return JSON.stringify({
    query, location, category,
    results: [],
    note: `未能搜索到 ${location} 的 ${query} 相关信息，建议直接使用 web_search 工具搜索`
  });
}

module.exports = { TOOL_DEF, execute };
