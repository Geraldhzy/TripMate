# 重复委派修复 - 测试计划

## 测试目标

验证以下三项修复是否有效防止了主 Agent 的重复委派行为：

1. ✅ 轮次上限前置检查（轮次 10/10 时停止工具执行）
2. ✅ coveredTopics 显式注入（确保 LLM 收到已覆盖主题警告）
3. ✅ System Prompt 强化（LLM 明确理解禁止重复委派）

---

## 测试场景

### 测试 1: 轮次上限测试

**目标**: 验证当轮次达到 10/10 时，是否停止工具调用

**操作步骤**:
1. 运行服务: `npm start`
2. 发送复杂查询（需要多轮对话）:
```json
{
  "messages": [
    { "role": "user", "content": "我要规划一个深圳到马来西亚的7天旅行，需要包括沙巴亚庇、斗湖两个城市。希望性价比好，要考虑航班、住宿、美食、签证各方面。" }
  ]
}
```
3. 观察日志输出

**预期结果**:
```
主Agent轮次 10/10...
轮次已满，拒绝工具调用 { currentRound: 10, maxRounds: 10, toolCount: 1 }
工具调用轮次已达上限，执行最终总结
```

**验证方法**:
```bash
grep "轮次已满，拒绝工具调用" logs/app-latest.log
# 应该看到这条日志（当到达第 10 轮有工具调用时）
```

---

### 测试 2: coveredTopics 注入测试

**目标**: 验证 delegate_to_agents 结果中的 coveredTopics 是否被正确提取并注入

**操作步骤**:
1. 监听 SSE 输出或查看日志
2. 发送需要委派的查询:
```json
{
  "messages": [
    { "role": "user", "content": "我要去日本东京旅游5天，出发日期是11月15日左右，什么时候买机票便宜？" }
  ]
}
```
3. 等待 delegate_to_agents 执行完成

**预期结果**:
```
已注入 coveredTopics { topics: ['航班搜索', '航线调研', '机票报价', '签证政策', ...], topicCount: 5 }

消息历史中应该看到:
role: 'user',
content: '⚠️ **已覆盖主题（严禁重复查询）**：
• 航班搜索
• 航线调研
• 机票报价
• 签证政策
...'
```

**验证方法**:
```bash
# 查看是否注入了 coveredTopics
grep "已注入 coveredTopics" logs/app-latest.log

# 查看具体的主题列表
grep -A 5 "已覆盖主题" logs/app-latest.log | head -20
```

---

### 测试 3: 重复委派防止测试

**目标**: 验证同一航线是否会被搜索两次

**操作步骤**:
1. 发送会导致多次委派的查询（模拟之前的问题情景）:
```json
{
  "messages": [
    { "role": "user", "content": "规划深圳到亚庇5天旅行，4月29日出发5月7日回，需要考虑五一假期。" }
  ]
}
```
2. 观察日志中是否有重复的委派调用

**预期结果**:
```
主Agent轮次 7/10 ...
开始委派 { taskCount: 2, agents: ['flight', 'research'] }
[第 1 次委派完成]

轮次 8/10, 9/10, 10/10: 基于已有结果工作
[不再出现第 2 次委派]

工具调用轮次已达上限，执行最终总结
delegationCount=1
```

**验证方法**:
```bash
# 检查单个请求中的委派次数
grep "开始委派" logs/app-latest.log | grep -B 2 "req:"
# 同一 req: 应该只出现 1 次，最多 2 次

# 检查不存在"delegationCount=2"+"maxRounds=10"的组合
grep "delegationCount=2" logs/app-latest.log | grep "maxRounds=10"
# 预期：无输出（问题已修复）
```

---

### 测试 4: System Prompt 有效性测试

**目标**: 验证 LLM 是否理解了新的禁止规则

**操作步骤**:
1. 查看 LLM 在收到 coveredTopics 后是否仍试图调用 delegate_to_agents
2. 观察 LLM 的回复文本（不应该说"让我再查一遍机票价格"之类的话）

**预期结果**:
```
LLM 回复应该包含：
"根据搜索结果，我已经为您找到了机票方案..."
"基于已有信息，我为您推荐..."

而不应该包含：
"让我重新搜索一下机票..."
"需要再调查一遍航班信息..."
```

**验证方法**:
- 查看最终回复中是否有重复查询相关表述
- 检查日志中 delegationCount 值

---

## 自动化测试脚本

### 脚本 1: 监控日志中的重复委派

```bash
#!/bin/bash
# check_double_delegation.sh

LOG_FILE="${1:logs/app-latest.log}"

echo "=== 检查重复委派问题 ==="
echo ""

# 检查是否存在 delegationCount=2 + maxRounds=10 的组合
DOUBLE_DELEGATION=$(grep "delegationCount" "$LOG_FILE" | grep "maxRounds=10" | wc -l)

if [ "$DOUBLE_DELEGATION" -gt 0 ]; then
  echo "❌ 发现问题: 存在 $DOUBLE_DELEGATION 次超限委派"
  grep "delegationCount" "$LOG_FILE" | grep "maxRounds=10" | head -5
  exit 1
else
  echo "✅ 通过: 无超限委派问题"
fi

# 检查是否成功注入 coveredTopics
INJECTION_COUNT=$(grep "已注入 coveredTopics" "$LOG_FILE" | wc -l)
echo ""
echo "✅ coveredTopics 注入 $INJECTION_COUNT 次"

# 检查轮次限制是否生效
ROUND_LIMIT=$(grep "轮次已满，拒绝工具调用" "$LOG_FILE" | wc -l)
echo "✅ 轮次限制触发 $ROUND_LIMIT 次"

echo ""
echo "总体状态: ✅ 修复有效"
```

### 脚本 2: 性能对比（修复前后）

```bash
#!/bin/bash
# compare_performance.sh

OLD_LOG="${1}"  # 修复前的日志
NEW_LOG="${2}"  # 修复后的日志

echo "=== 修复前后性能对比 ==="
echo ""

# 计算平均请求时长
OLD_AVG=$(grep "请求完成" "$OLD_LOG" | sed 's/.*耗时: //' | sed 's/ms.*//' | \
          awk '{sum+=$1; count++} END {if(count>0) print sum/count; else print 0}')

NEW_AVG=$(grep "请求完成" "$NEW_LOG" | sed 's/.*耗时: //' | sed 's/ms.*//' | \
          awk '{sum+=$1; count++} END {if(count>0) print sum/count; else print 0}')

echo "修复前平均耗时: ${OLD_AVG} ms"
echo "修复后平均耗时: ${NEW_AVG} ms"

IMPROVEMENT=$(echo "scale=2; (1 - $NEW_AVG/$OLD_AVG) * 100" | bc)
echo "性能提升: ${IMPROVEMENT}%"

# API 调用次数对比
OLD_CALLS=$(grep "delegate_to_agents\|search_flights" "$OLD_LOG" | wc -l)
NEW_CALLS=$(grep "delegate_to_agents\|search_flights" "$NEW_LOG" | wc -l)

echo ""
echo "修复前 API 调用数: $OLD_CALLS"
echo "修复后 API 调用数: $NEW_CALLS"
REDUCTION=$(echo "scale=2; (1 - $NEW_CALLS/$OLD_CALLS) * 100" | bc)
echo "API 调用减少: ${REDUCTION}%"
```

---

## 测试执行清单

- [ ] 测试 1 通过：轮次上限检查生效
- [ ] 测试 2 通过：coveredTopics 正确注入
- [ ] 测试 3 通过：无重复委派
- [ ] 测试 4 通过：LLM 遵守新规则
- [ ] 语法检查通过：server.js 和 system-prompt.js
- [ ] 日志验证：无错误和异常
- [ ] 性能测试：响应时间改善
- [ ] 回归测试：其他功能未被破坏

---

## 部署前核查

部署到生产环境前，请确保：

1. **代码审查**
   - [ ] 所有修改已通过语法检查
   - [ ] 没有引入新的依赖
   - [ ] 修改与现有代码风格一致

2. **功能验证**
   - [ ] 本地测试通过
   - [ ] 与测试环境集成成功
   - [ ] 日志输出符合预期

3. **性能验证**
   - [ ] 没有引入额外的 CPU 开销
   - [ ] 内存使用正常
   - [ ] 响应时间在预期范围内

4. **兼容性验证**
   - [ ] 与现有 API 兼容
   - [ ] 与前端界面兼容
   - [ ] 与数据库操作兼容

---

## 监控仪表板建议

部署后建议在监控系统中追踪以下指标：

| 指标 | 目标值 | 告警阈值 |
|------|--------|----------|
| delegationCount ≤ 2 的比例 | 100% | < 99% |
| coveredTopics 注入成功率 | 100% | < 98% |
| 轮次上限触发次数 | < 1% 请求 | > 5% 请求 |
| 平均请求耗时 | < 60s | > 90s |
| delegate_to_agents 成功率 | > 95% | < 90% |

---

## 问题排查指南

如果修复部署后仍出现重复委派：

### 问题 1: 仍然看到 delegationCount=2

**可能原因**:
- 修改未正确部署
- 缓存问题

**排查步骤**:
```bash
# 确认修改已部署
grep "轮次已满，拒绝工具调用" server.js
# 应该看到代码

# 检查是否有旧进程运行
ps aux | grep "node.*server.js" | grep -v grep
# 必要时重启服务
```

### 问题 2: coveredTopics 未被注入

**可能原因**:
- JSON.parse 失败
- 结果格式不对

**排查步骤**:
```bash
# 查看调试日志
grep "coveredTopics 提取失败\|已注入 coveredTopics" logs/app-latest.log

# 如果看到"提取失败"，检查 delegate.js 的返回格式
grep "JSON.stringify.*coveredTopics" agents/delegate.js
```

### 问题 3: LLM 仍在第 10 轮调用工具

**可能原因**:
- 轮次检查没有生效
- LLM 忽略了错误消息

**排查步骤**:
```bash
# 检查轮次检查是否被执行
grep "if (round + 1 >= MAX_TOOL_ROUNDS" server.js

# 检查是否有"轮次已满"日志
grep "轮次已满，拒绝工具调用" logs/app-latest.log

# 如果没有，可能轮次检查没有被执行
```

---

## 完成标志

修复成功的标志：

✅ **日志中无 "delegationCount=2" + "maxRounds=10" 的组合**

✅ **每个请求的 delegationCount ≤ 2（通常为 1）**

✅ **消息历史中有 "已覆盖主题" 的警告**

✅ **同一航线不会出现两次搜索**

✅ **LLM 的最终回复中没有重复查询的表述**

✅ **平均请求耗时比修复前缩短 10-20%**

