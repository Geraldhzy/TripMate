# 实用信息（Practical Information）完整研究报告

## 📖 文档概览

本研究详细分析了旅行规划应用中"实用信息"的完整实现。已生成 4 份深度文档，涵盖架构、代码、数据流和实现细节。

### 📚 文档导航

| 文档 | 用途 | 推荐场景 |
|------|------|---------|
| **PRACTICAL_INFO_FINDINGS.md** | 总结报告 | ⭐ 快速了解全貌 |
| **PRACTICAL_INFO_QUICK_REFERENCE.md** | 快速查询 | 🔍 查找特定字段/方法 |
| **PRACTICAL_INFO_ANALYSIS.md** | 详细分析 | 📖 深入理解实现 |
| **PRACTICAL_INFO_ARCHITECTURE.txt** | 架构图表 | 🎨 可视化数据流 |

---

## 🎯 一分钟速览

### 问题：实用信息是如何存储和显示的？

**答案**：通过三层架构：

```
AI Conversation
    ↓
Tools: web_search / update_trip_info / cache_destination_knowledge
    ↓
server.js (L350-380) 处理工具结果
    ↓
TripBook 模型存储数据
    ├─ dynamic.webSearches[]     (web search 实用信息)
    └─ itinerary.reminders[]     (行前清单)
    ↓
toPanelData() 导出
    ↓
SSE 事件推送到前端
    ↓
Frontend: itinerary.js
    ├─ updateFromTripBook()      (接收数据)
    └─ renderSectionPrepAndInfo() (渲染UI)
    ↓
User 看到：📚 行前准备 & 实用信息 面板
├─ 🌤️ 天气预报
├─ 🛂 签证信息
├─ 💱 汇率
├─ 🔍 实用信息 ⭐
├─ ⚠️ 特殊需求
└─ 📝 行前清单 ⭐
```

---

## 📍 核心位置映射

### 后端关键文件

```
models/trip-book.js (542 行)
├─ L34                dynamic.webSearches[]        存储实用信息
├─ L56                itinerary.reminders[]        存储行前清单
├─ L103-115           addWebSearch()               添加搜索结果
├─ L198-238           updateItinerary()            更新行程（含清单）
└─ L430-506           toPanelData()  ⭐ 关键       导出前端数据

tools/dest-knowledge.js (166 行)
├─ L19-41             TOOL_DEF                     工具定义
├─ L43-50             execute()                    保存知识
├─ L83-92             saveOneToFile()              文件持久化
├─ L95-127            loadFromFiles()              启动加载
└─ prompts/knowledge/dest-*.js                    知识库文件

server.js
├─ L353-360           web_search 结果处理
├─ L372-373           update_trip_info 结果处理
└─ L376-379           SSE 推送到前端
```

### 前端关键文件

```
public/js/itinerary.js (694 行)
├─ L5-26              itineraryState              状态对象
├─ L159-215           updateFromTripBook()  ⭐   接收 SSE 数据
├─ L483-576           renderSectionPrepAndInfo()  ⭐ 渲染UI
├─ L487-488           签证/实用信息 分类筛选
└─ L581-584           toggleReminder()            复选框交互

public/css/style.css
├─ L682-704           .prep-card                  行前准备卡片
├─ L814-831           .info-card                  实用信息卡片
├─ L724-746           .reminder-check             复选框样式
└─ L707-710           .reminder-list              清单样式
```

---

## 🔑 关键发现

### ✅ 实现的核心机制

#### 1. **实用信息自动收集** 
- AI 调用 `web_search` → 后端自动提取
- 存入 `tripBook.dynamic.webSearches[]`
- 按 query 去重（避免重复搜索）

#### 2. **行前清单支持**
- AI 调用 `update_trip_info` 工具
- 传入 `itinerary.reminders: [...]`
- 前端显示可交互复选框

#### 3. **智能分类**
- Web search 结果自动分类：
  - **签证信息**: 正则匹配 `/签证|visa|入境|护照|免签/`
  - **实用信息**: 其他搜索结果 ⭐

#### 4. **知识库缓存**
- AI 可调用 `cache_destination_knowledge`
- 保存到 `prompts/knowledge/dest-{destination}.js`
- TTL: 30 天

### ⚠️ 当前限制

| 限制 | 描述 |
|------|------|
| 无状态持久化 | Reminder 复选框状态只存本地 DOM，不保存后端 |
| 只读显示 | 用户无法编辑实用信息，仅 AI 提供 |
| 相似去重 | Web search 按 query 去重，但相似 query 的结果可能重复 |

---

## 📊 数据结构

### TripBook 中的存储

```javascript
// Layer 1: Dynamic Data
this.dynamic.webSearches = [
  { query: "日本免签", summary: "找到15条结果...", fetched_at: 1712953200000 },
  { query: "日本WiFi", summary: "找到8条结果...", fetched_at: 1712953201000 }
];

this.dynamic.exchangeRates = {
  "JPY_CNY": { from: "JPY", to: "CNY", rate: 0.043022, _meta: {...} }
};

// Layer 3: Itinerary
this.itinerary.reminders = [
  "出发前3天完成Visit Japan Web注册",
  "兑换3万日元现金",
  "购买旅行保险"
];
```

### 前端状态

```javascript
let itineraryState = {
  webSearchSummaries: [
    { query, summary, fetched_at },
    ...
  ],
  exchangeRates: [
    { from, to, rate, last_updated },
    ...
  ],
  reminders: [
    "出发前3天完成Visit Japan Web注册",
    ...
  ],
  specialRequests: [
    { type, value, confirmed },
    ...
  ],
  weather: {...} or null,
  weatherList: [...]
};
```

---

## 🔄 数据流示例

### 示例：用户询问"日本WiFi"

```
1. User: "日本有哪些WiFi选项？"
   ↓
2. AI Response: calls web_search(query: "日本WiFi")
   ↓
3. Tool Result: 找到8条结果，首条是"...日本Wi-Fi租赁..."
   ↓
4. server.js (L353-360)
   tripBook.addWebSearch({
     query: "日本WiFi",
     summary: "找到8条结果，首条：日本Wi-Fi租赁..."
   })
   ↓ 存入 dynamic.webSearches[]
   ↓
5. tripBook.toPanelData() 导出
   webSearchSummaries: [
     { 
       query: "日本WiFi",
       summary: "找到8条结果，首条：日本Wi-Fi租赁...",
       fetched_at: 1712953200000
     }
   ]
   ↓
6. SSE 事件: tripbook_update
   ↓
7. Frontend: updateFromTripBook(data)
   itineraryState.webSearchSummaries = [...]
   renderPanel() → renderSectionPrepAndInfo()
   ↓
8. Filter: 不含"签证/visa/入境/护照/免签" → 属于"实用信息"
   ↓
9. HTML Output:
   <div class="tab-content-section">
     <div class="tab-section-label">🔍 实用信息</div>
     <div class="info-card">
       <div class="info-card-title">日本WiFi</div>
       <div class="info-card-body">找到8条结果，首条：日本Wi-Fi租赁...</div>
     </div>
   </div>
   ↓
10. User sees: 🔍 实用信息 section with "日本WiFi" info
```

---

## 🛠️ 调试指南

### 查看实时数据

```javascript
// 浏览器开发者工具
console.log(itineraryState);
console.log(itineraryState.reminders);
console.log(itineraryState.webSearchSummaries);
console.log(itineraryState.exchangeRates);
console.log(itineraryState.specialRequests);
```

### 检查 TripBook 快照

```javascript
// Network 标签 → SSE 事件 → tripbook_update
// 查看 _snapshot 字段中的完整结构
{
  _snapshot: {
    dynamic: { webSearches, exchangeRates, weather, ... },
    itinerary: { reminders, days, route, ... },
    constraints: { ... }
  }
}
```

### 验证知识缓存

```javascript
// Node.js REPL 中
const dest = require('./tools/dest-knowledge');
dest.initCache();
console.log(dest.getAllCachedDests());
console.log(dest.getCachedDestKnowledge('日本'));
```

---

## 📋 常见问题

### Q: 实用信息和签证信息如何区分？
**A**: 通过正则表达式 `/签证|visa|入境|护照|免签/` 对 `webSearchSummaries` 进行筛选。匹配的显示为"签证信息"，其他的显示为"实用信息"。

### Q: 用户勾选行前清单后会保存吗？
**A**: 目前不会。复选框只在本地 DOM 中切换样式 (`toggleReminder()`)，不会发送到后端。这是一个可以改进的地方。

### Q: Web search 结果如何去重？
**A**: 按 `query` 字段去重。如果相同的查询被多次搜索，后来的结果会覆盖之前的结果。

### Q: 目的地知识缓存有多长时间的有效期？
**A**: 30 天 (CACHE_TTL)。超过 30 天的缓存在加载时会被忽略。

### Q: 如何添加新的实用信息类型？
**A**: 需要在 `renderSectionPrepAndInfo()` 中添加新的筛选逻辑。例如，如果要添加"美食信息"，可以按照类似的方式过滤 `webSearchSummaries`。

---

## 🎓 学习路径

### 初级：快速了解
1. 阅读本文档（README_PRACTICAL_INFO.md）
2. 查看 PRACTICAL_INFO_QUICK_REFERENCE.md 的速查表

### 中级：理解实现
1. 阅读 PRACTICAL_INFO_FINDINGS.md 的"核心发现"章节
2. 查看代码位置映射
3. 在浏览器中观察 SSE 事件

### 高级：深入代码
1. 阅读 PRACTICAL_INFO_ANALYSIS.md 的详细分析
2. 逐行阅读关键文件：
   - `models/trip-book.js` L430-506 (toPanelData)
   - `public/js/itinerary.js` L483-576 (renderSectionPrepAndInfo)
   - `server.js` L350-380 (工具结果处理)
3. 参考 PRACTICAL_INFO_ARCHITECTURE.txt 的完整架构图

---

## 🔧 修改指南

### 改进：实现 Reminder 持久化

**当前**: Reminder 状态只存本地 DOM
**目标**: 将状态持久化到后端

**修改步骤**:
1. 在 `toggleReminder()` 中添加 API 调用
2. 后端添加 endpoint 保存 reminder 状态
3. 在 TripBook 中添加字段记录已勾选的 reminder

### 改进：支持编辑实用信息

**当前**: 实用信息只读
**目标**: 用户可编辑

**修改步骤**:
1. 在 HTML 中添加编辑按钮
2. 支持修改 `webSearchSummaries` 内容
3. 提交修改时更新 TripBook
4. 通过 SSE 推送更新到其他客户端

---

## 📞 技术支持

如有问题，检查以下文件：

| 问题 | 查看文件 |
|------|---------|
| 找不到字段 | PRACTICAL_INFO_QUICK_REFERENCE.md - 快速查询表 |
| 不理解数据流 | PRACTICAL_INFO_ARCHITECTURE.txt - ASCII 架构图 |
| 需要代码行号 | PRACTICAL_INFO_ANALYSIS.md - 详细的行号注释 |
| 要修改代码 | PRACTICAL_INFO_FINDINGS.md - 改进指南 |

---

## 📝 文档版本

- **创建时间**: 2026年4月13日
- **应用版本**: ai-travel-planner (current)
- **研究范围**: 实用信息完整实现
- **涵盖文件**: 10+ 核心文件，542+ 行代码分析

---

## 🎉 总结

"实用信息"的实现在该应用中是一个**设计精良、模块化强**的系统：

✅ **优点**:
- 清晰的三层架构
- 自动去重机制
- 智能分类策略
- 实时 SSE 推送
- 知识库缓存机制

⚠️ **改进空间**:
- Reminder 状态持久化
- 实用信息编辑功能
- 更精细的去重策略

🚀 **未来方向**:
- 支持用户收藏/标记实用信息
- 智能推荐相关信息
- 多语言实用信息支持

---

**Happy exploring! 🧳✈️**
