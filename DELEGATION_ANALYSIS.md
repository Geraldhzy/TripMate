# AI Travel Planner - 重复委派根因分析报告

## 执行摘要

分析了 `2026-04-14.log` 中的 12+ 个重复委派案例，发现主 Agent 在完成 10 轮对话限制后，**触发了 maxRounds 上限条件，但未停止工作，而是在超出上限状态下继续调用 delegate_to_agents**。

### 核心问题

1. **主 Agent 在超出工具调用轮次上限后仍可调用工具**
   - 日志显示明确的警告信息：`工具调用轮次已达上限，执行最终总结`
   - 但同时还有第二次 delegate_to_agents 调用出现

2. **delegationCount 计数与 maxRounds 的计数逻辑不一致**
   - 每次 delegate_to_agents 调用应该计为"一轮"
   - 但似乎出现了"同一轮中多个 delegate_to_agents 调用"的情况

3. **coveredTopics 未在消息历史中有效传递**
   - delegate.js 中 coveredTopics 字段虽然已生成
   - 但在进入新轮次时，LLM 的消息上下文中可能未包含这个信息

---

## 详细案例分析

### 案例 1: 请求 ID 33451bfe（最明确的证据）

**时间轴：**
```
15:40:13 - 主Agent轮次 1/10，msgCount=4
15:40:20 - 主Agent轮次 2/10，msgCount=6
15:40:26 - 主Agent轮次 3/10，msgCount=8
15:40:32 - 主Agent轮次 4/10，msgCount=10
15:40:47 - 主Agent轮次 5/10，msgCount=12
15:40:55 - 主Agent轮次 6/10，msgCount=14
15:41:13 - 主Agent轮次 7/10，msgCount=16
         → [第 1 次委派开始] delegate_to_agents(flight)

15:43:06 - 主Agent轮次 8/10，msgCount=18  (第1次委派结果返回)
15:43:13 - 主Agent轮次 9/10，msgCount=20
15:43:33 - 主Agent轮次 10/10，msgCount=22  (已达上限)
         → [第 2 次委派开始] delegate_to_agents(flight)  🔴 超出上限！

15:44:33 - 工具调用轮次已达上限，执行最终总结  ⚠️ 警告信息
```

**第 1 次委派的任务描述（15:41:13）：**
```
搜索深圳及周边机场到马来西亚沙巴亚庇（机场代码BKI）的机票。
出发城市：深圳（SZX）及香港（HKG）。
目的地：亚庇（BKI）。
出行日期：2026年4月29日至5月7日之间（涵盖五一假期），
可搜索4月... [截断]
```

**第 2 次委派的任务描述（15:43:52，超出上限后）：**
```
搜索从深圳（SZX）到马来西亚亚庇（BKI）的机票。
出行日期：2026年4月30日至5月6日期间。
请搜索多种出发日期组合（如4月30日、5月1日出发，5月5日、6日返回），
包括直飞和中转航班（可能在吉... [截断]
```

**关键发现：**
- 两次任务描述非常相似，但日期范围稍有调整（第1次：4/29-5/7，第2次：4/30-5/6）
- 第1次委派耗时 **1.9 分钟**（113 秒）
- 第2次委派耗时 **40.6 秒**
- 两次都是搜索 **同一航线**（深圳→亚庇）
- 第2次出现在 **maxRounds=10 轮次已用完** 之后

---

### 案例 2: 请求 ID 01f0fad0

**时间轴：**
```
16:48:34 - 主Agent轮次 6/10，msgCount=14
         → [第 1 次委派开始] delegate_to_agents(flight)
         
         搜索上海到东京的机票。出发城市：上海，考虑浦东机场(PVG)和虹桥机场(SHA)。
         目的地：东京，考虑成田机场(NRT)和羽田机场(HND)。
         日期：2026年11月15日左右出发，11月21日左右返回...

16:49:01 - 主Agent轮次 7/10，msgCount=16  (第1次委派完成 27.3秒)

16:49:19 - 主Agent轮次 8/10，msgCount=18
         → [第 2 次委派开始] delegate_to_agents(flight)
         
         搜索上海到东京的往返机票。出发城市：上海，浦东机场(PVG)。
         目的地：东京，考虑成田机场(NRT)和羽田机场(HND)。
         去程日期：2026年11月15日，返程日期：2026年11月21日。人数：2人。

16:49:54 - 主Agent轮次 9/10，msgCount=18  (第2次委派完成 34.6秒)
```

**关键发现：**
- 第1次：模糊日期范围"前后弹性"，多机场选项
- 第2次：精确日期"2026年11月15日"和"2026年11月21日"，机场范围缩小
- 两次委派之间间隔：**18 秒**（msgCount 从 16 跳到 18，中间经过1轮 LLM 思考）
- **这不是超出上限触发的重复**，而是 LLM 在同一轮次中决定"需要更精确的搜索"

---

### 案例 3: 请求 ID 55093211

**时间轴：**
```
16:52:50 - 主Agent轮次 7/10，msgCount=18
         → [第 1 次委派] delegate_to_agents(flight)
         搜索从上海（PVG/SHA）到东京（NRT/HND）的直飞航班，
         出发日期2026年11月15日左右...

16:54:39 - 主Agent轮次 8/10，msgCount=20  (第1次委派完成 108.8秒)

16:54:49 - 主Agent轮次 8/10，msgCount=20  (没有推进到轮次9，仍在轮次8)
         → [第 2 次委派] delegate_to_agents(flight)
         搜索从大阪(KIX)到上海(PVG/SHA)的直飞航班，
         出发日期2026年11月21日左右...

16:55:13 - 主Agent轮次 9/10，msgCount=22  (第2次委派完成 24.6秒)
```

**关键发现：**
- 第2次委派前 **msgCount 未增加**（仍为 20）
- 两个航线完全不同：第1次 Shanghai→Tokyo，第2次 Osaka→Shanghai
- LLM 在轮次 8 的同一批工具调用中 **同时发起两个不同的 delegate_to_agents 调用**
- 这表明 LLM 在处理"返程"航班时的决策方式

---

### 案例 4: 请求 ID 54846870（最复杂的案例）

**时间轴：**
```
18:28:29 - 主Agent轮次 3/10
         → [第 1 次委派] delegate_to_agents
           tasks: [
             { agent: flight, task: 搜索上海到东京的往返机票... },
             { agent: research, task: 调研日本旅行信息... }
           ]

18:29:35 - 主Agent轮次 4/10  (第1次委派完成 66.2秒)

18:29:50 - 主Agent轮次 4/10  (msgCount 未增加！仍在轮次4)
         → [第 2 次委派] delegate_to_agents
           tasks: [
             { agent: flight, task: 搜索上海到东京的往返机票。 
               去程：2026年11月21日，返程：2026年11月27日... },
             { agent: research, task: 调研日本旅行信息... }
           ]

18:30:30 - 完成
```

**关键发现：**
- **同一轮次内两次委派**（轮次 4 没有推进）
- 第 1 次 research 任务：多个主题，模糊表述
- 第 2 次 research 任务：更具体的日期和细化的调研主题
- 暗示 LLM 在处理"为了补充遗漏的细节而重新委派"的情况

---

## 问题根源分析

### 问题 1: maxRounds 的计数逻辑

**当前日志中的问题：**
```
15:43:52.532Z WARN  [req:33451bfe] 工具调用轮次已达上限，执行最终总结 | maxRounds=10, delegationCount=2
```

这条日志表明：
- 已经发生了 **2 次 delegate_to_agents 调用**
- 但在第 2 次之后才打印警告

**推测的逻辑缺陷：**
```javascript
// 伪代码 - 可能的当前实现
if (toolCallsThisRound.length > 0) {
  roundCount++;
  if (roundCount >= maxRounds) {
    // 警告已打印...
    // 但第二次委派已经发生了
  }
}
```

### 问题 2: 子 Agent 结果中的 coveredTopics 未被有效利用

**delegate.js 中的实现：**
```javascript
const AGENT_COVERED_TOPICS = {
  flight: ['航班搜索', '航线调研', '机票报价', '航空公司对比'],
  research: ['签证政策', '城际交通', '天气气候', '特色活动', '美食推荐']
};

return JSON.stringify({
  results: formattedResults,
  coveredTopics,  // ✅ 已生成
  _instruction: '以上主题已由子Agent完成调研...'
});
```

**但在 LLM 消息历史中...**
- 如果 coveredTopics 字段没有被主动提取并注入到消息中
- 或者在新的对话轮次中丢失
- LLM 就看不到"已覆盖"的标记

**System Prompt 中的指示：**
```
⛔ 硬性规则：完全信任 Agent 结果：Agent 返回的结果中包含 coveredTopics 字段列出已覆盖主题，
这些主题严禁再用 web_search 重复搜索。
```

问题：LLM 能否在新一轮对话中看到上一轮的 coveredTopics？

### 问题 3: 超出 maxRounds 后的 LLM 决策

**观察到的行为：**
- 在轮次 9/10 完成后，LLM 仍然决定再调用 delegate_to_agents
- 没有停止，也没有降级策略
- 直接进入"超出上限→最终总结"状态

**推测原因：**
1. LLM 可能未被清晰告知轮次限制
2. 或者轮次限制的警告在 LLM 接收消息前没有显示
3. 或者 LLM 的 System Prompt 中关于轮次限制的说明不够明确

---

## 重复委派的四种模式

### 模式 1: 超出上限重复（案例 1: 33451bfe）

**特征：**
- 轮次达到 10/10，仍有第 2 次委派
- 日志出现 `工具调用轮次已达上限` 警告
- delegationCount ≥ 2

**根因：**
- 轮次检查在工具执行后才进行
- 第 2 次委派已提交给执行器

### 模式 2: 同轮次多委派（案例 3/4）

**特征：**
- msgCount 未增加，轮次号相同
- 连续发起 2 个 delegate_to_agents
- 通常用于处理"去程+返程"或"多主题调研"

**根因：**
- LLM 认为同一轮中应该并行处理多个子任务
- 或者第 1 次结果不完整，需要立即补充

### 模式 3: 日期精化重复（案例 2: 01f0fad0）

**特征：**
- 两次任务描述相似但日期粒度不同
- 第 1 次：宽泛范围 "11月15日左右"
- 第 2 次：精确日期 "2026年11月15日"

**根因：**
- LLM 的迭代优化：先用宽泛参数测试，再精化
- 可能是缺乏"search_flights 应该一次性处理多个日期组合"的指示

### 模式 4: 信息补充重复（案例 4: 54846870）

**特征：**
- 同一轮次内，第 2 次委派包含更详细的参数
- research 任务从宽泛 → 具体

**根因：**
- LLM 收到第 1 次结果，发现不够详细，决定立即补充
- 没有在消息中标注"信息已充分"

---

## 为什么 coveredTopics 未能有效阻止重复

### 信息流分析

1. **工具执行返回 JSON：**
   ```json
   {
     "results": [...],
     "coveredTopics": ["航班搜索", "航线调研", ...],
     "_instruction": "..."
   }
   ```

2. **JSON 被转为字符串后返回到 LLM：**
   ```
   assistant message: "调用了 delegate_to_agents 工具"
   tool message: "{\"results\": [...], \"coveredTopics\": [...]}"
   ```

3. **问题点：**
   - coveredTopics 可能在过长的工具结果中被截断
   - 或者在新轮次中消息历史不包含上一轮的工具返回内容
   - 或者 LLM 的 context window 到了后期变窄，早期的 coveredTopics 信息被淘汰

---

## 建议修复方案

### 优先级 1: 修复轮次上限检查

**问题代码位置：** `server.js` 中的工具调用轮次计数

**修复方案：**
```javascript
// 检查是否已达上限
if (currentRound >= maxRounds && toolNames.length > 0) {
  return {
    error: '已达工具调用轮次上限（10轮），停止继续调用工具。',
    action: '执行最终总结'
  };
}
```

**在工具提交前做预检查，而非事后警告。**

### 优先级 2: 在消息中明确强调 coveredTopics

**修改 system-prompt.js：**

在每个委派结果返回后，主 Agent 应该：
1. 解析返回的 JSON
2. 提取 coveredTopics
3. 在消息历史中写入一条强制性的备注
4. 告诉 LLM"以下主题已覆盖，禁止重复查询"

**示例实现：**
```javascript
// 在处理工具结果时
if (toolResult.includes('coveredTopics')) {
  const parsed = JSON.parse(toolResult);
  const coverNote = `
    ⚠️ 已覆盖主题（禁止重复查询）：${parsed.coveredTopics.join(', ')}
    ${parsed._instruction}
  `;
  // 将 coverNote 强制注入到消息历史中
  messages.push({
    role: 'user',
    content: coverNote
  });
}
```

### 优先级 3: 完整示例规范

**在 system-prompt.js 中添加：**

```
## delegate_to_agents 执行规范

每次调用 delegate_to_agents 后，子 Agent 返回结果中包含：
- results: 子Agent的调研结果
- coveredTopics: 已覆盖的主题列表（禁止再用 web_search）

### ✅ 正确做法
1. 接收子 Agent 结果
2. 查看 coveredTopics 字段
3. 直接采纳结果，**不再用 web_search 搜索这些主题**
4. 如需补充，针对明确的新主题调用（不是已覆盖主题）

### ❌ 错误做法
- 收到 flight 结果后立即再次委派 flight（重复搜索同一航线）
- 收到 research 结果后用 web_search 再查一遍签证政策（已覆盖）
- 同一轮次内多次委派同一 Agent 处理相同/相似任务

## 每请求最多委派次数
- 每个用户请求最多 2 次 delegate_to_agents 调用
- 第 1 次：初始需求搜索（flight + research 并行）
- 第 2 次：仅在用户修改需求后追加调查（如改变出发日期）
```

### 优先级 4: 强化 LLM 行为约束

**在 system-prompt.js 中修改职责边界部分：**

```
⚠️ **禁止的 2 个行为**

1. 同一轮次内多次 delegate_to_agents
   ❌ 错：发起第 1 次委派 → 收到结果 → 立即发起第 2 次委派
   ✅ 对：发起委派 → 等待结果 → 用户回馈后再决定是否需要第 2 次

2. delegate_to_agents 后再用 web_search 搜索同一主题
   ❌ 错：delegate_to_agents(flight) → 收到结果 → web_search "航班"
   ✅ 对：delegate_to_agents(flight) → 收到结果 → 直接采纳 → search_poi 查景点

子 Agent 返回的 coveredTopics 是"禁区标记"，任何被标记的主题都禁止再查一遍。
```

---

## 日志监控指标

### 新增警告条件

```javascript
// server.js 中添加
if (delegationCallsInRequest >= 2) {
  log.warn('同一请求内多次 delegate_to_agents', {
    count: delegationCallsInRequest,
    agents: [/* 代理列表 */],
    risk: '可能存在重复委派'
  });
}

if (lastToolIsDelegate && currentToolIsDelegate) {
  log.warn('连续 delegate_to_agents 调用', {
    lastAgent: lastTool.agent,
    currentAgent: currentTool.agent,
    msgCountDiff: currentMsg - lastMsg
  });
}
```

### 日志查询案例

```bash
# 查找所有重复委派
grep "delegationCount.*=.*2" app-*.log

# 查找同一轮次的多个委派
grep -B2 "delegate_to_agents" app-*.log | grep "轮次.*/" | uniq -d

# 查找超出上限的调用
grep "工具调用轮次已达上限" app-*.log | head -20
```

---

## 修复验证清单

- [ ] 修改轮次检查逻辑，在工具提交前做预检查
- [ ] 添加 coveredTopics 显式注入（在消息历史中突出显示）
- [ ] System Prompt 中补充重复委派禁止示例
- [ ] 添加日志警告：同一请求多次委派
- [ ] 添加日志警告：超出轮次仍有工具调用
- [ ] 在集成测试中验证：不会出现同航线的两次委派
- [ ] 在集成测试中验证：不会出现 delegate + web_search 同一主题
- [ ] 查看真实用户反馈，验证是否仍有遗漏

