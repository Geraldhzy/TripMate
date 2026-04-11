/**
 * 目的地知识库缓存工具
 * AI 遇到新目的地时主动调用，将搜索到的基础信息结构化保存，避免后续重复搜索
 * 支持本地文件持久化，服务重启后自动恢复
 */

const fs = require('fs');
const path = require('path');

const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 天
const DATA_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(DATA_DIR, 'dest-cache.json');
const destCache = new Map(); // destination → { content, saved_at }

const TOOL_DEF = {
  name: 'cache_destination_knowledge',
  description: [
    '将目的地基础信息保存为知识库缓存，供本次及后续对话复用，避免重复搜索。',
    '调用时机：对话中出现新目的地（国家/城市），且系统提示中尚无该目的地的知识库时。',
    '调用前请先通过 web_search 搜集关键信息，再整理成结构化内容调用本工具保存。',
    '内容应包含：签证政策（中国护照）、官方货币与汇率参考、语言、最佳旅游季节、',
    '主要城市间交通方式、入境注意事项、常用 App/支付方式。'
  ].join(''),
  parameters: {
    type: 'object',
    properties: {
      destination: {
        type: 'string',
        description: '目的地名称，用中文简洁表达，如"日本"、"泰国"、"新加坡"、"越南河内"'
      },
      content: {
        type: 'string',
        description: '结构化目的地知识，Markdown 格式，包含签证、货币、语言、最佳季节、城市间交通、注意事项等'
      }
    },
    required: ['destination', 'content']
  }
};

async function execute({ destination, content }) {
  if (!destination || !content) {
    return JSON.stringify({ error: '缺少必要参数: destination, content' });
  }
  destCache.set(destination, { content, saved_at: Date.now() });
  saveCacheToDisk();
  return JSON.stringify({ success: true, destination, message: `已缓存"${destination}"目的地知识库，后续对话将直接复用` });
}

/** 获取指定目的地缓存（过期返回 null） */
function getCachedDestKnowledge(destination) {
  const entry = destCache.get(destination);
  if (!entry) return null;
  if (Date.now() - entry.saved_at > CACHE_TTL) { destCache.delete(destination); return null; }
  return entry;
}

/** 获取所有未过期的目的地缓存 */
function getAllCachedDests() {
  const now = Date.now();
  const result = [];
  for (const [dest, entry] of destCache) {
    if (now - entry.saved_at <= CACHE_TTL) result.push({ destination: dest, ...entry });
    else destCache.delete(dest);
  }
  return result;
}

module.exports = { TOOL_DEF, execute, getCachedDestKnowledge, getAllCachedDests, initCache };

// ============================================================
// 文件持久化
// ============================================================

/** 启动时从磁盘加载缓存，过滤过期条目 */
function loadCacheFromDisk() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const entries = JSON.parse(raw);
    const now = Date.now();
    for (const [dest, entry] of Object.entries(entries)) {
      if (entry.saved_at && (now - entry.saved_at) <= CACHE_TTL) {
        destCache.set(dest, entry);
      }
    }
    console.log(`  📚 已加载 ${destCache.size} 条目的地知识缓存`);
  } catch (err) {
    console.warn('  ⚠️ 加载目的地知识缓存失败:', err.message);
  }
}

/** 将内存缓存写入磁盘 */
function saveCacheToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const obj = {};
    for (const [dest, entry] of destCache) {
      obj[dest] = entry;
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.warn('  ⚠️ 保存目的地知识缓存失败:', err.message);
  }
}

/** 初始化：启动时调用，从磁盘恢复缓存 */
function initCache() {
  loadCacheFromDisk();
}
