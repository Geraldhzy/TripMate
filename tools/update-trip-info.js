/**
 * update_trip_info 工具
 *
 * 让 AI 主动推送结构化的用户约束和行程数据到 TripBook，
 *
 * AI 在以下时机调用：
 *   1. 确认用户需求后（目的地、日期、人数、预算、偏好）
 *   2. 推进到新的规划阶段时
 *   3. 确定行程路线、每日安排、预算汇总时
 *
 * 注意：本工具的 execute() 只做数据验证和格式化返回，
 * 实际写入 TripBook 的操作在 server.js 中完成（因为 TripBook 实例在 server 作用域内）。
 */

const TOOL_DEF = {
  name: 'update_trip_info',
  description: [
    '更新行程参考书。当确认用户需求、完成信息查询、或推进行程规划时调用此工具。',
    '调用时机：1）用户明确了目的地/日期/人数/预算等约束信息后；',
    '2）查询到机票/酒店/天气等信息需要记录时；',
    '3）推进到新的规划阶段或生成行程框架时。',
    '传入的数据为增量更新，只需传变化的字段。'
  ].join(''),
  parameters: {
    type: 'object',
    properties: {
      constraints: {
        type: 'object',
        description: [
          '用户约束增量更新。可包含以下字段（只传变化的）：',
          'destination: { value: "日本", cities: ["东京","京都"], confirmed: true }，',
          'departCity: { value: "北京", airports: ["PEK","PKX"], confirmed: true }，',
          'dates: { start: "2026-05-01", end: "2026-05-07", days: 7, flexible: false, notes: "请假天数不限", confirmed: true }，',
          'people: { count: 2, details: "2个成人", confirmed: true }，',
          'budget: { value: "2万", per_person: true, currency: "CNY", scope: "含机票住宿", notes: "可适当超预算", confirmed: true }，',
          'preferences: { tags: ["美食","文化"], notes: "以休闲为主，不赶行程，不接受红眼航班", confirmed: true }，',
          'specialRequests: [{ type: "dietary", value: "清真", confirmed: true }]'
        ].join('')
      },
      phase: {
        type: 'integer',
        description: '当前规划阶段（1-7）：1锁定约束 2机票查询 3构建框架 4关键预订 5每日详情 6预算汇总 7导出总结'
      },
      itinerary: {
        type: 'object',
        description: [
          '行程数据增量更新。可包含：',
          'route: ["东京","京都","大阪"]，',
          'days: [{ day: 1, date: "2026-05-01", city: "东京", title: "抵达东京", segments: [{ time: "14:00", title: "抵达机场", type: "flight", location: "成田机场", duration: "", notes: "" }, { time: "19:00", title: "晚餐：浅草天妇罗", type: "meal", location: "大黒家", notes: "人均¥2000日元" }] }]，',
          'segment.type 必须是以下之一：transport（交通）、attraction（景点）、activity（体验活动）、meal（餐饮）、hotel（住宿）、flight（航班），用于前端分类展示。',
          'budgetSummary: { flights: { amount_cny: 6480, label: "机票" }, ..., total_cny: 17964 }，',
          'reminders: ["出发前完成Visit Japan Web注册", "兑换3万日元现金", "购买旅行保险"] — 行前准备清单，在最终阶段必须写入，',
          'practicalInfo: [{ category: "签证", content: "中国护照需提前1-2个月通过旅行社申请，准备在职证明和银行流水", icon: "🛂" }] — AI分析总结的实用信息，按category覆盖更新。常用分类：签证(🛂)、货币支付(💱)、交通出行(🚄)、通讯网络(📱)、气候穿衣(👔)、文化礼仪(🎌)'
        ].join('')
      }
    }
  }
};

async function execute(args) {
  const { constraints, phase, itinerary } = args || {};

  // 基本验证
  if (!constraints && phase === undefined && !itinerary) {
    return JSON.stringify({ error: '至少需要传入 constraints、phase、itinerary 中的一个' });
  }

  // 构建回执（server.js 会从 tool result 中读取并写入 TripBook）
  const updates = {};
  const messages = [];

  // 字段名中→英翻译映射（供用户可见的标签）
  const FIELD_LABELS = {
    destination: '目的地',
    departCity: '出发城市',
    dates: '日期',
    people: '人数',
    budget: '预算',
    preferences: '偏好',
    specialRequests: '特殊需求',
  };

  // 内部7阶段 → 面板4阶段映射（与前端 itinerary.js 的 mapPhase 保持一致）
  function mapPhaseToDisplay(raw) {
    if (raw <= 1) return { num: 1, label: '确认需求' };
    if (raw <= 3) return { num: 2, label: '规划行程' };
    if (raw <= 5) return { num: 3, label: '完善细节' };
    return { num: 4, label: '预算总结' };
  }

  if (constraints) {
    // ⚠️ CRITICAL: Ensure all constraint fields have confirmed: true for system prompt injection
    // Without confirmed flag, buildConstraintsPromptSection() will mark as "待确认" (pending)
    // and AI will re-ask the question due to missing "严禁重复询问" rule
    updates.constraints = constraints;
    
    // Set confirmed: true on all constraint fields if not explicitly set
    const constraintFields = ['destination', 'departCity', 'dates', 'people', 'budget', 'preferences', 'specialRequests'];
    for (const field of constraintFields) {
      if (constraints[field] !== undefined) {
        if (Array.isArray(constraints[field])) {
          // specialRequests is array
          constraints[field] = constraints[field].map(item => ({
            ...item,
            confirmed: item.confirmed !== false ? true : false
          }));
        } else if (typeof constraints[field] === 'object') {
          // Other fields are objects
          constraints[field].confirmed = constraints[field].confirmed !== false ? true : false;
        }
      }
    }
    
    const fields = Object.keys(constraints).filter(k => k !== '_reason');
    const fieldLabels = fields.map(f => FIELD_LABELS[f] || f);
    messages.push(`已记录${fieldLabels.join('、')}`);
  }

  if (phase !== undefined) {
    if (phase < 1 || phase > 7) {
      return JSON.stringify({ error: 'phase 必须在 1-7 之间' });
    }
    updates.phase = phase;
    const display = mapPhaseToDisplay(phase);
    messages.push(`${display.label}（${display.num}/4）`);
  }

  if (itinerary) {
    updates.itinerary = itinerary;
    const ITIN_LABELS = {
      route: '路线',
      days: '每日行程',
      budgetSummary: '预算摘要',
      reminders: '提醒事项',
      practicalInfo: '实用信息',
    };
    const fields = Object.keys(itinerary);
    const fieldLabels = fields.map(f => ITIN_LABELS[f] || f);
    messages.push(`已更新${fieldLabels.join('、')}`);
  }

  return JSON.stringify({
    success: true,
    updates,
    message: messages.join('；')
  });
}

module.exports = { TOOL_DEF, execute };
