/**
 * 目的地知识库缓存工具
 * AI 遇到新目的地时主动调用，将搜索到的基础信息结构化保存，避免后续重复搜索
 * 存储位置：prompts/knowledge/dest-{目的地}.js（每个目的地一个文件）
 */

const fs = require('fs');
const path = require('path');

const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 天
const KNOWLEDGE_DIR = path.join(__dirname, '..', 'prompts', 'knowledge');
const destCache = new Map(); // destination → { content, saved_at }

// 旧版 JSON 缓存路径（用于迁移）
const LEGACY_DATA_DIR = path.join(__dirname, '..', 'data');
const LEGACY_CACHE_FILE = path.join(LEGACY_DATA_DIR, 'dest-cache.json');

const TOOL_DEF = {
  name: 'cache_destination_knowledge',
  description: [
    '将目的地基础信息保存为知识库缓存，供本次及后续对话复用，避免重复搜索。',
    '按层级分别缓存：国家级（destination="日本"）存签证/货币/语言等全国通用信息；',
    '城市级（destination="日本-东京"）存机场/市内交通/区域简介等城市特有信息。',
    '严禁混合命名如"西欧法国意大利"，多国行程须分别缓存每个国家和城市。'
  ].join(''),
  parameters: {
    type: 'object',
    properties: {
      destination: {
        type: 'string',
        description: '目的地名称。国家级用国名（如"日本"、"法国"），城市级用"国家-城市"（如"日本-东京"、"法国-巴黎"）。严禁组合命名。'
      },
      content: {
        type: 'string',
        description: '结构化知识，Markdown 格式。国家级：签证、货币、语言、时区、入境注意事项等全国通用信息。城市级：机场、市内交通、区域简介、实用App等城市特有信息。不要跨层级重复。'
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
  saveOneToFile(destination, content, Date.now());
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
// 文件持久化（JS 文件格式）
// ============================================================

/** 生成目的地知识库的文件路径 */
function destFilePath(destination) {
  return path.join(KNOWLEDGE_DIR, `dest-${destination}.js`);
}

/** 将单个目的地知识写入 JS 文件 */
function saveOneToFile(destination, content, savedAt) {
  try {
    // 转义反引号和 ${} 以便安全放入模板字符串
    const escaped = content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    const jsContent = `/** 目的地知识库：${destination}（自动生成，可人工编辑） */\nmodule.exports = {\n  destination: '${destination.replace(/'/g, "\\'")}',\n  saved_at: ${savedAt},\n  content: \`${escaped}\`\n};\n`;
    fs.writeFileSync(destFilePath(destination), jsContent, 'utf-8');
  } catch (err) {
    console.warn(`  ⚠️ 保存目的地知识库文件失败 [${destination}]:`, err.message);
  }
}

/** 启动时从 prompts/knowledge/dest-*.js 加载缓存 */
function loadFromFiles() {
  try {
    const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.startsWith('dest-') && f.endsWith('.js'));
    const now = Date.now();
    let loaded = 0;

    for (const file of files) {
      try {
        const fullPath = path.join(KNOWLEDGE_DIR, file);
        // 清除 require 缓存以确保读取最新内容
        delete require.cache[require.resolve(fullPath)];
        const entry = require(fullPath);

        if (entry.destination && entry.content) {
          if (entry.saved_at && (now - entry.saved_at) <= CACHE_TTL) {
            destCache.set(entry.destination, { content: entry.content, saved_at: entry.saved_at });
            loaded++;
          } else {
            // 过期的文件不加载到内存，但保留文件（人工可能编辑过）
          }
        }
      } catch (err) {
        console.warn(`  ⚠️ 加载知识库文件失败 [${file}]:`, err.message);
      }
    }

    if (loaded > 0) {
      console.log(`  📚 已加载 ${loaded} 条目的地知识缓存（来自 prompts/knowledge/）`);
    }
  } catch (err) {
    console.warn('  ⚠️ 扫描知识库目录失败:', err.message);
  }
}

/** 从旧版 data/dest-cache.json 迁移数据 */
function migrateLegacyCache() {
  try {
    if (!fs.existsSync(LEGACY_CACHE_FILE)) return;

    console.log('  🔄 发现旧版 data/dest-cache.json，正在迁移到 prompts/knowledge/...');
    const raw = fs.readFileSync(LEGACY_CACHE_FILE, 'utf-8');
    const entries = JSON.parse(raw);
    let migrated = 0;

    for (const [dest, entry] of Object.entries(entries)) {
      if (!entry.content || !entry.saved_at) continue;

      // 只迁移未过期的条目
      if (Date.now() - entry.saved_at > CACHE_TTL) continue;

      // 检查是否已有对应的 JS 文件（避免覆盖人工编辑的内容）
      if (fs.existsSync(destFilePath(dest))) continue;

      saveOneToFile(dest, entry.content, entry.saved_at);
      destCache.set(dest, { content: entry.content, saved_at: entry.saved_at });
      migrated++;
    }

    // 迁移完成，删除旧文件
    fs.unlinkSync(LEGACY_CACHE_FILE);
    console.log(`  ✅ 迁移完成：${migrated} 条目的地知识库已写入 prompts/knowledge/，旧文件已删除`);
  } catch (err) {
    console.warn('  ⚠️ 迁移旧版缓存失败:', err.message);
  }
}

/** 初始化：启动时调用，先迁移旧数据，再加载 JS 文件 */
function initCache() {
  migrateLegacyCache();
  loadFromFiles();
}
