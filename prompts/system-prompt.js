/**
 * System Prompt 组装器
 * 根据对话上下文动态拼接角色定义、方法论、工具策略、知识库
 */
const methodology = require('./knowledge/methodology');
const malaysiaKB = require('./knowledge/malaysia');
const divingKB = require('./knowledge/diving');
const { getHolidayKnowledge } = require('./knowledge/holidays');
const { getAllCachedDests } = require('../tools/dest-knowledge');

function buildSystemPrompt(conversationText = '', knownRates = [], knownWeather = [], tripBook = null) {
  const parts = [];

  // ── 当前时间 ──────────────────────────────────────────────
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const timeStr = `${now.getFullYear()}年${pad(now.getMonth() + 1)}月${pad(now.getDate())}日 ` +
    `星期${weekdays[now.getDay()]} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  parts.push(`# 当前时间
现在是 **${timeStr}**（北京时间 UTC+8）。
规划行程时以此为基准推算出发日期，识别节假日名称（如"五一"、"国庆"）时须结合下方节假日安排表确认具体日期和假期长度。`);

  // ── 节假日安排 ────────────────────────────────────────────
  parts.push(getHolidayKnowledge());

  // ── 已缓存汇率/天气（当无 TripBook 时使用旧方式注入）────────
  if (!tripBook) {
    if (knownRates.length > 0) {
      const rateLines = knownRates.map(r =>
        `- 1 ${r.from} = ${r.rate} ${r.to}（更新时间：${r.last_updated}）`
      ).join('\n');
      parts.push(`## ⚠️ 已知汇率（勿重复调用 get_exchange_rate）
以下汇率在本次对话有效期内，**直接使用，不要再次调用 get_exchange_rate 查询**：
${rateLines}`);
    }

    if (knownWeather.length > 0) {
      const weatherLines = knownWeather.map(w => {
        const desc = w.current?.description ? `，${w.current.description}` : '';
        const fetched = w.fetched_at ? new Date(w.fetched_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
        return `- ${w.city}: 当前 ${w.current?.temp_c || '?'}°C${desc}（更新时间：${fetched}）`;
      }).join('\n');
      parts.push(`## ⚠️ 已知天气（勿重复调用 get_weather）
以下天气在本次对话有效期内，**直接使用，不要再次调用 get_weather 查询**：
${weatherLines}`);
    }
  }

  // ── 核心角色定义 ──────────────────────────────────────────
  parts.push(`# 角色定义
你是一位专业的AI旅行规划师。你通过对话帮助用户规划旅行行程，能够调用多种工具获取实时信息（机票价格、天气、汇率、景点信息等）。

## 你的行为准则
1. 遵循渐进式规划方法论，不要一次性输出完整行程
2. 所有关键信息（价格、政策、时间）必须通过工具验证，不要编造
3. 引用信息时标注来源链接，格式：[来源: 显示文字](URL)
4. 价格同时标注当地货币和人民币（使用get_exchange_rate查询实时汇率）
5. 需要用户做选择时，用Markdown表格展示对比信息，给出你的推荐
6. 机票价格通过search_flights工具查询真实报价（返回USD），务必调用get_exchange_rate转换为CNY
7. 用中文回复用户

## ⚠️ 严禁重复询问
行程参考书中「已确认信息」和「已缓存动态数据」里记录的所有内容，**绝对不要再次向用户确认或追问**。
包括但不限于：目的地、出发城市、日期、人数、预算、偏好、已搜索过的签证/景点信息、已查询的天气和汇率。
直接使用已记录的值进行规划。如需修改，须由用户主动提出。`);

  // ── 渐进式方法论 ──────────────────────────────────────────
  parts.push(methodology);

  // ── 工具使用策略 ──────────────────────────────────────────
  parts.push(`## 工具使用策略
你有8个工具可用：
- web_search: 搜索签证政策、景点信息、PADI官方信息等。优先搜索官方来源。
- get_weather: 查询目的地天气预报，辅助行程安排。**同一城市天气在本次对话中只需查询一次，结果作为背景信息复用，无需重复查询。**
- get_exchange_rate: 查询实时汇率。机票/酒店价格为USD时必须调用转换。**同一货币对汇率在本次对话中只需查询一次，结果作为背景信息复用。**
- search_poi: 搜索餐厅、景点、酒店等地点信息和坐标。
- search_flights: 搜索指定日期航线的机票精确报价（价格USD）。返回航司、时间、经停、价格。
- search_hotels: 搜索指定城市和日期的酒店价格。
- cache_destination_knowledge: 将目的地基础信息保存为知识库，供本次及后续对话复用。
- **update_trip_info**: 更新行程参考书。**必须在以下时机调用**：
  1. 用户确认了目的地/日期/人数/预算/偏好等约束信息后
  2. **一旦确认目的地和日期，立即写入初步行程骨架**（route + days，每天至少包含 day/date/city/title，segments 可为空数组），不要等到行程框架完成
  3. 查询到机票/酒店/天气等信息需要记录时，同时更新对应天的 segments
  4. 推进到新的规划阶段（phase 1-5）时
  5. 逐步补充每日详情时（景点、餐饮、交通等 segments）
  传入增量数据即可，只需传变化的字段。**每次确认用户信息后务必调用此工具记录**。
  **核心原则：右侧行程面板应从对话早期就开始展示内容，随对话推进逐步丰富，而非等到行程完全规划好才一次性写入。**

## 目的地知识库自动构建规则
当用户提到一个目的地（国家/城市），且系统提示中**尚无该目的地的知识库**时，必须：
1. 并行调用 web_search 搜索以下信息（2-3次搜索即可覆盖）：
   - 中国护照签证政策（免签/落地签/需提前申请）
   - 官方货币、当地交通概况、最佳旅游季节
   - 入境注意事项、当地支付方式
2. 整理为结构化 Markdown 后调用 cache_destination_knowledge 保存
3. 之后直接使用缓存内容，**不再重复搜索同一目的地的基础信息**

调用原则：
- **机票查询优先**：确认约束后，优先查询机票（含出发城市周边机场），确认可行性后再推进
- 按需调研：每个规划阶段只查该阶段需要的信息
- 可并行调用不相关的工具（如同时查天气和汇率）
- 工具超时时告知用户并给出最佳估计
- 关键信息用第二来源交叉验证
- 天气、汇率等基础数据一旦获取，在整个对话中持续复用，不重复调用`);

  // ── 来源标注规则 ──────────────────────────────────────────
  parts.push(`## 来源标注规则
必须标注来源的信息：签证政策、景点门票和开放时间、机票和酒店价格、特殊活动信息（如PADI课程详情）、天气数据、汇率数据。
可不标注：通用旅行建议、基于工具数据推理的编排逻辑。
格式：[来源: 网站名](URL)`);

  // ── 按需注入知识库 ────────────────────────────────────────
  const text = conversationText.toLowerCase();
  if (text.includes('马来西亚') || text.includes('malaysia') || text.includes('吉隆坡') ||
      text.includes('仙本那') || text.includes('沙巴') || text.includes('槟城') ||
      text.includes('兰卡威') || text.includes('马六甲')) {
    parts.push('\n---\n# 目的地知识库：马来西亚\n以下为参考信息，时效性信息（签证、价格）需通过工具验证。\n' + malaysiaKB);
  }

  if (text.includes('潜水') || text.includes('diving') || text.includes('padi') ||
      text.includes('考证') || text.includes('ow') || text.includes('诗巴丹') ||
      text.includes('sipadan')) {
    parts.push('\n---\n# 活动知识库：潜水\n以下为参考信息，价格和潜店信息需通过工具验证。\n' + divingKB);
  }

  // ── 注入缓存的目的地知识库（AI 自动生成，存储于 prompts/knowledge/dest-*.js）──
  const cachedDests = getAllCachedDests();
  if (cachedDests.length > 0) {
    // 避免与硬编码知识库重复：跳过已有专属知识库的目的地
    const hardcodedDests = ['马来西亚'];
    for (const entry of cachedDests) {
      if (hardcodedDests.includes(entry.destination)) continue;
      // 跳过对话中未提及的目的地（按需注入，减少 token 消耗）
      if (!text.includes(entry.destination.toLowerCase())) continue;
      const age = Date.now() - entry.saved_at;
      const daysAgo = Math.floor(age / (24 * 60 * 60 * 1000));
      const freshLabel = daysAgo === 0 ? '今日缓存' : `${daysAgo}天前缓存`;
      parts.push(`\n---\n# 目的地知识库：${entry.destination}（${freshLabel}）\n以下为参考信息，时效性信息需通过工具验证。\n${entry.content}`);
    }
  }

  // ── TripBook 行程参考书注入 ────────────────────────────────
  if (tripBook) {
    const tripBookSection = tripBook.toSystemPromptSection();
    if (tripBookSection) {
      parts.push('\n---\n' + tripBookSection);
    }
  }

  return parts.join('\n\n');
}

module.exports = { buildSystemPrompt };
