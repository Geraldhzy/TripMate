# 重复委派 - 快速修复指南

## 🎯 立即行动清单

### Step 1: 验证问题是否仍存在 (5 分钟)
```bash
# 查看最新日志
tail -f logs/app-2026-04-15.log | grep "delegationCount"

# 检查是否有超出上限的调用
grep "工具调用轮次已达上限.*delegationCount=2" logs/app-*.log | wc -l
```

预期结果：
- ✅ 无输出 = 问题已解决
- ❌ 有输出 = 问题仍存在

---

### Step 2: 修复轮次检查 (10 分钟) - 优先级 🔴 P1

**文件:** `server.js`

**找到这段代码** (约行 645):
```javascript
if (currentPhase < 2 && toolNames.some(n => ['delegate_to_agents', 'search_flights'].includes(n))) {
  // ...phase check...
}
```

**改为在前面添加轮次检查**:
```javascript
// ⚠️ 轮次检查：工具提交前执行（必须在工具执行前）
if (currentRound >= maxRounds && toolNames.length > 0) {
  const msg = `已达工具调用轮次上限（${maxRounds} 轮），停止继续调用工具。执行最终总结。`;
  reqLog.warn('轮次已满，拒绝工具调用', { 
    currentRound, 
    maxRounds, 
    toolCount: toolNames.length 
  });
  // 返回错误响应给 LLM，让它生成最终总结
  messages.push({
    role: 'user',
    content: msg
  });
  break; // 退出工具调用循环
}
```

**验证:** 在 logs 中不应再看到 `delegationCount=2` 在 `maxRounds=10` 状态

---

### Step 3: 显式注入 coveredTopics (15 分钟) - 优先级 🔴 P2

**文件:** `server.js` 中处理工具返回的地方

**找到这段代码** (约行 220-240):
```javascript
if (funcName === 'delegate_to_agents') {
  const resultStr = await executeDelegation(...);
  sendSSE('tool_result', { id: toolId, name: funcName });
  return resultStr;
}
```

**改为主动提取并突出显示**:
```javascript
if (funcName === 'delegate_to_agents') {
  const resultStr = await executeDelegation(...);
  
  // 关键：解析并突出显示 coveredTopics
  try {
    const delegResult = JSON.parse(resultStr);
    if (delegResult.coveredTopics && delegResult.coveredTopics.length > 0) {
      const coverMsg = `
⚠️ **已覆盖主题（严禁重复查询）**：
${delegResult.coveredTopics.map(t => `• ${t}`).join('\n')}

${delegResult._instruction || ''}
      `.trim();
      
      // 强制注入到消息历史中
      messages.push({
        role: 'user',
        content: coverMsg
      });
      
      reqLog.debug('injected coveredTopics', { 
        topics: delegResult.coveredTopics 
      });
    }
  } catch (e) {
    // JSON parse 失败，继续
  }
  
  sendSSE('tool_result', { id: toolId, name: funcName });
  return resultStr;
}
```

**验证:** 在 LLM 回复中应该看到"已覆盖主题"的警告信息

---

### Step 4: 强化 System Prompt (5 分钟) - 优先级 🟡 P3

**文件:** `prompts/system-prompt.js`

**在职责边界部分添加** (约行 95):
```javascript
## ⚠️ 禁止的重复行为

### 1. 禁止同一轮次内多次委派 (0/1 rule)
❌ 错误:
  delegate_to_agents({ tasks: [flight] })  // 第 1 次
  [收到结果]
  delegate_to_agents({ tasks: [flight] })  // 第 2 次 - 禁止！

✅ 正确:
  delegate_to_agents({ tasks: [flight, research] })  // 一次性并行
  [收到结果，直接采纳]

### 2. 禁止超出轮次后仍然调用工具
❌ 错误: 轮次 9/10 → 10/10 → 仍然调用工具
✅ 正确: 轮次 10/10 → 停止调用工具 → 生成最终总结

### 3. 禁止对已覆盖主题再次搜索
- 收到 delegate_to_agents 结果中的 coveredTopics
- 这些主题 100% 已被子 Agent 覆盖
- 绝对不要用 web_search 再查一遍
- 违反此规则会导致：重复工作、上下文浪费、时间浪费
```

---

### Step 5: 添加日志监控 (10 分钟) - 优先级 🟢 P4

**文件:** `server.js` 中的日志部分

```javascript
// 在每个请求完成后添加
const delegationCount = messageHistory
  .filter(m => m.role === 'assistant' && m.content?.includes('delegate_to_agents'))
  .length;

if (delegationCount > 2) {
  reqLog.error('🚨 异常：超过 2 次委派', { delegationCount });
}

if (delegationCount === 2) {
  reqLog.info('⚠️ 有 2 次委派（边界情况），检查是否合理', { delegationCount });
}
```

---

## 📋 验证清单

修复完成后运行这些测试：

```bash
# Test 1: 轮次上限生效
npm test -- --testNamePattern="round limit"

# Test 2: 不会超出上限后委派
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "user", "content": "我要规划深圳去马来西亚5天的旅行，包括亚庇和斗湖。" }
    ]
  }' \
  2>&1 | grep -c "delegationCount=2"
# 预期：0 或 1（最多 1 次）

# Test 3: coveredTopics 被注入到消息中
grep "已覆盖主题" logs/app-latest.log | head -3

# Test 4: 没有同航线的两次搜索
grep "搜索.*到.*的.*票" logs/app-latest.log | sort | uniq -d | wc -l
# 预期：0
```

---

## 🔍 日志查询快速参考

```bash
# 查看所有重复委派（工作前）
grep "delegationCount" logs/app-2026-04-14.log | head -10

# 查看修复后是否还有超限调用
grep "工具调用轮次已达上限.*delegationCount=2" logs/app-2026-04-15.log

# 查看 coveredTopics 是否被正确注入
grep "已覆盖主题" logs/app-2026-04-15.log | head -5

# 按请求统计委派次数
grep "req:" logs/app-2026-04-15.log | \
  grep "delegate_to_agents" | \
  cut -d'[' -f2 | cut -d']' -f1 | \
  sort | uniq -c | sort -rn
```

---

## 📊 修复前后对比

### 修复前 ❌
```
请求 33451bfe:
  轮次 7/10: delegate_to_agents(flight) → 1.9 分钟
  轮次 8-10:  其他工具调用...
  轮次 10/10: delegate_to_agents(flight) 再次出现 🔴
  警告: 工具调用轮次已达上限，delegationCount=2
```

### 修复后 ✅
```
请求 33451bfe:
  轮次 7/10: delegate_to_agents(flight) → 1.9 分钟
  轮次 8-9:  其他工具调用...
  轮次 10/10: 检查到已达上限，停止工具调用 ✓
  生成最终总结，delegationCount=1
```

---

## ⏱️ 预计时间

| 步骤 | 时间 | 优先级 |
|-----|------|--------|
| Step 1: 验证问题 | 5分钟 | - |
| Step 2: 修复轮次检查 | 10分钟 | 🔴 高 |
| Step 3: 注入 coveredTopics | 15分钟 | 🔴 高 |
| Step 4: 增强 Prompt | 5分钟 | 🟡 中 |
| Step 5: 日志监控 | 10分钟 | 🟢 低 |
| 验证测试 | 10分钟 | - |
| **总计** | **55分钟** | |

---

## 🆘 遇到问题？

### 问题 1: 修改后仍然有重复委派
- ✅ 检查轮次检查是否真的被执行了（添加 log.info）
- ✅ 检查 maxRounds 的值是否为 10
- ✅ 查看日志中是否有"轮次已满"的警告信息

### 问题 2: LLM 收不到 coveredTopics 警告
- ✅ 检查 JSON.parse 是否成功
- ✅ 验证消息历史中是否确实有"已覆盖主题"的条目
- ✅ 查看是否有 JSON parse 异常日志

### 问题 3: 修改后出现新错误
- ✅ 检查 break 语句是否能正确退出循环
- ✅ 验证消息格式是否正确
- ✅ 查看是否有 TypeScript 或语法错误

---

## ✨ 完成标志

修复完成后，应该看到：

✅ 日志中不再出现"delegationCount=2"且"maxRounds=10"的组合
✅ 每个请求的 delegationCount ≤ 2
✅ 消息中有"已覆盖主题"的警告
✅ 同一航线不会搜索两次
✅ 用户反馈中没有"为什么要查两遍"的抱怨

---

## 🔗 相关文档

- 详细分析: `DELEGATION_ANALYSIS.md`
- 总结表格: `DELEGATION_SUMMARY.txt`
- 系统提示: `prompts/system-prompt.js`
- 委派逻辑: `agents/delegate.js`

