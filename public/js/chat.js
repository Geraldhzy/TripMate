/**
 * 聊天核心逻辑
 * 消息收发、SSE流式接收、Markdown渲染、工具状态展示、行程历史管理
 */

// ============================================================
// 状态
// ============================================================
let chatHistory = []; // { role, content }
let isStreaming = false;
let currentTripId = null; // 当前正在规划的行程 ID（null = 新对话未保存）

// ============================================================
// 设置管理
// ============================================================
function loadSettings() {
  return {
    provider: localStorage.getItem('tp_provider') || 'openai',
    model: localStorage.getItem('tp_model') || 'gpt-4o',
    apiKey: localStorage.getItem('tp_apiKey') || '',
    baseUrl: localStorage.getItem('tp_baseUrl') || ''
  };
}

function saveSettings() {
  localStorage.setItem('tp_provider', document.getElementById('provider').value);
  localStorage.setItem('tp_model', document.getElementById('model').value);
  localStorage.setItem('tp_apiKey', document.getElementById('apiKey').value);
  localStorage.setItem('tp_baseUrl', document.getElementById('baseUrl').value);
  toggleSettings();
}

function toggleSettings() {
  const panel = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');
  const isActive = panel.classList.contains('active');
  if (!isActive) {
    // 填充当前值
    const s = loadSettings();
    document.getElementById('provider').value = s.provider;
    document.getElementById('model').value = s.model;
    document.getElementById('apiKey').value = s.apiKey;
    document.getElementById('apiKey').placeholder = PROVIDER_PLACEHOLDERS[s.provider] || 'API Key';
    document.getElementById('baseUrl').value = s.baseUrl;
  }
  panel.classList.toggle('active');
  overlay.classList.toggle('active');
}

// ============================================================
// Provider 切换联动
// ============================================================
const PROVIDER_MODELS = {
  openai: [['gpt-4o', 'GPT-4o'], ['gpt-4o-mini', 'GPT-4o Mini']],
  anthropic: [['claude-sonnet-4-20250514', 'Claude Sonnet 4'], ['claude-opus-4-20250514', 'Claude Opus 4']],
  deepseek: [['deepseek-chat', 'DeepSeek V3'], ['deepseek-reasoner', 'DeepSeek R1']]
};
const PROVIDER_PLACEHOLDERS = {
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
  deepseek: 'sk-...'
};

document.getElementById('provider').addEventListener('change', function() {
  const modelSelect = document.getElementById('model');
  modelSelect.innerHTML = '';
  (PROVIDER_MODELS[this.value] || []).forEach(([v, t]) => modelSelect.add(new Option(t, v)));
  document.getElementById('apiKey').placeholder = PROVIDER_PLACEHOLDERS[this.value] || 'API Key';
});

// ============================================================
// 消息发送
// ============================================================
function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || isStreaming) return;

  const settings = loadSettings();
  if (!settings.apiKey) {
    alert('请先在设置中配置 API Key');
    toggleSettings();
    return;
  }

  // 添加用户消息
  chatHistory.push({ role: 'user', content: text });
  appendUserMessage(text);
  input.value = '';
  autoResizeInput();
  hideWelcome();

  // 发送到后端
  streamChat(settings);
}

function sendQuickStart(text) {
  document.getElementById('msg-input').value = text;
  sendMessage();
}

function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// 自动调整输入框高度
const msgInput = document.getElementById('msg-input');
msgInput.addEventListener('input', autoResizeInput);
function autoResizeInput() {
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
}

// ============================================================
// SSE 流式聊天
// ============================================================
async function streamChat(settings) {
  isStreaming = true;
  document.getElementById('send-btn').disabled = true;

  // 创建 assistant 气泡
  const { bubble, toolContainer } = appendAssistantMessage();
  let fullText = '';

  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-Api-Key': settings.apiKey
    };
    if (settings.baseUrl) {
      headers['X-Base-Url'] = settings.baseUrl;
    }

    // 构建请求体（汇率/天气/TripBook 通过 body 传递，避免 header 编码问题）
    const bodyPayload = {
      messages: chatHistory,
      provider: settings.provider,
      model: settings.model
    };
    const freshRates = getFreshRates();
    if (freshRates.length > 0) bodyPayload.knownRates = freshRates;
    const freshWeather = getFreshWeather();
    if (freshWeather.length > 0) bodyPayload.knownWeather = freshWeather;
    try {
      const tripBookSnapshot = sessionStorage.getItem('tp_tripbook_snapshot')
                             || sessionStorage.getItem('tp_tripbook');
      if (tripBookSnapshot) bodyPayload.tripBookSnapshot = JSON.parse(tripBookSnapshot);
    } catch {}

    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyPayload)
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(err.error || '请求失败');
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留未完整的行

      let eventType = null;
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ') && eventType) {
          try {
            const data = JSON.parse(line.slice(6));
            handleSSEEvent(eventType, data, bubble, toolContainer, () => fullText);
            if (eventType === 'token') {
              fullText += data.text;
            }
          } catch {}
          eventType = null;
        }
      }
    }

    // 保存 assistant 回复
    if (fullText) {
      chatHistory.push({ role: 'assistant', content: fullText });
    }

  } catch (err) {
    bubble.innerHTML = `<span style="color:red">❌ ${escapeHtml(err.message)}</span>`;
  } finally {
    isStreaming = false;
    userScrolledUp = false; // 流式结束，恢复自动滚动
    hideScrollHint();
    document.getElementById('send-btn').disabled = false;
    // 清理所有还在转的 spinner（防止 done 事件丢失时残留）
    toolContainer.querySelectorAll('.tool-status.running').forEach(el => {
      el.className = 'tool-status done';
      if (el.dataset.group) {
        const total = parseInt(el.dataset.total);
        el.innerHTML = `<span>${groupLabel(el.dataset.group, total, total)}</span>`;
      } else {
        const originalLabel = el.dataset.label || el.querySelector('span')?.textContent || '工具';
        el.innerHTML = `<span>✅ ${originalLabel}</span>`;
      }
    });
    scrollToBottom();
    // 每次 AI 回复完成后自动保存当前行程
    saveTripSnapshot();
  }
}

// ============================================================
// SSE 事件处理
// ============================================================
function handleSSEEvent(type, data, bubble, toolContainer, getFullText) {
  switch (type) {
    case 'token':
      const currentText = getFullText() + data.text;
      bubble.innerHTML = renderMarkdown(currentText);
      scrollToBottom();
      break;

    case 'tool_start': {
      // search_flights / search_hotels 聚合显示：多条航线合并为一行
      if (GROUPED_TOOLS.includes(data.name)) {
        const groupKey = `group_${data.name}`;
        let groupEl = toolContainer.querySelector(`[data-group="${data.name}"]`);
        if (!groupEl) {
          groupEl = document.createElement('div');
          groupEl.className = 'tool-status running';
          groupEl.dataset.group = data.name;
          groupEl.dataset.total = '0';
          groupEl.dataset.done = '0';
          toolContainer.appendChild(groupEl);
        }
        const total = parseInt(groupEl.dataset.total) + 1;
        groupEl.dataset.total = total;
        // 记录每个 id 映射到 group
        toolContainer.dataset[data.id || data.name] = data.name;
        groupEl.innerHTML = `<div class="spinner"></div><span>${groupLabel(data.name, total, 0)}</span>`;
        scrollToBottom();
        break;
      }
      // 其他工具：单独展示，保留完整搜索内容
      const toolEl = document.createElement('div');
      toolEl.className = 'tool-status running';
      toolEl.dataset.toolId = data.id || data.name;
      const label = toolLabel(data.name, data.arguments);
      toolEl.dataset.label = label;
      toolEl.innerHTML = `<div class="spinner"></div><span>${label}</span>`;
      toolContainer.appendChild(toolEl);
      scrollToBottom();
      break;
    }

    case 'tool_result': {
      const key = data.id || data.name;
      // 检查是否属于聚合组
      const groupName = toolContainer.dataset[key];
      if (groupName) {
        const groupEl = toolContainer.querySelector(`[data-group="${groupName}"]`);
        if (groupEl) {
          const total = parseInt(groupEl.dataset.total);
          const done = parseInt(groupEl.dataset.done) + 1;
          groupEl.dataset.done = done;
          if (done >= total) {
            groupEl.className = 'tool-status done';
            groupEl.innerHTML = `<span>${groupLabel(groupName, total, total)}</span>`;
          } else {
            groupEl.innerHTML = `<div class="spinner"></div><span>${groupLabel(groupName, total, done)}</span>`;
          }
        }
        break;
      }
      // 普通工具：优先用服务端生成的 resultLabel，其次用原始搜索内容标签
      const runningEl = toolContainer.querySelector(`[data-tool-id="${key}"]`);
      if (runningEl) {
        runningEl.className = 'tool-status done';
        const fallbackLabel = runningEl.dataset.label || toolLabel(data.name, null);
        const displayLabel = data.resultLabel ? `${fallbackLabel} — ${data.resultLabel}` : fallbackLabel;
        runningEl.innerHTML = `<span>✅ ${displayLabel}</span>`;
      }
      break;
    }

    case 'rate_cached':
      // 服务端返回新鲜汇率，存入 localStorage 供后续对话复用
      if (data.rate && !data.error) saveRateToCache(data);
      break;

    case 'weather_cached':
      // 服务端返回天气数据，存入 localStorage 供后续对话复用
      if (!data.error) saveWeatherToCache(data);
      // 同步更新行程面板天气
      if (typeof updateItinerary === 'function' && data.current) {
        updateItinerary({ weather: { city: data.city, temp_c: data.current.temp_c, description: data.current.description } });
      }
      break;

    case 'itinerary_update':
      if (typeof updateItinerary === 'function') updateItinerary(data);
      break;

    case 'tripbook_update': {
      // 提取并存储完整快照（供服务端恢复 TripBook）
      const snapshot = data._snapshot;
      if (snapshot) {
        try { sessionStorage.setItem('tp_tripbook_snapshot', JSON.stringify(snapshot)); } catch {}
      }
      // 面板渲染用去掉 _snapshot 的数据（避免 itinerary.js 处理多余字段）
      const panelData = { ...data };
      delete panelData._snapshot;
      if (typeof updateFromTripBook === 'function') updateFromTripBook(panelData);
      // 同时保存面板数据（供页面刷新时快速恢复面板）
      try { sessionStorage.setItem('tp_tripbook', JSON.stringify(panelData)); } catch {}
      break;
    }

    case 'quick_replies':
      renderQuickReplies(data, bubble);
      break;



    case 'error':
      bubble.innerHTML += `<br><span style="color:red">❌ ${escapeHtml(data.message)}</span>`;
      break;

    case 'done':
      // 把所有还在 running 状态的 spinner 全部标记完成（防止残留）
      toolContainer.querySelectorAll('.tool-status.running').forEach(el => {
        el.className = 'tool-status done';
        if (el.dataset.group) {
          const total = parseInt(el.dataset.total);
          el.innerHTML = `<span>${groupLabel(el.dataset.group, total, total)}</span>`;
        } else {
          const originalLabel = el.dataset.label || el.querySelector('span')?.textContent || '工具';
          el.innerHTML = `<span>✅ ${originalLabel}</span>`;
        }
      });
      break;
  }
}

// 聚合展示的工具（同类多次调用合并为一行）
const GROUPED_TOOLS = ['search_flights', 'search_hotels', 'web_search'];

// ============================================================
// Quick Reply Chips 渲染
// ============================================================
function renderQuickReplies(data, bubble) {
  if (!data.questions || data.questions.length === 0) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'quick-replies-wrapper';

  // 每组问题的选中状态
  const selections = {}; // groupIdx → string (single) or array (multi)

  const groups = data.questions;
  groups.forEach((q, gIdx) => {
    const isMulti = !!q.multiSelect;
    selections[gIdx] = isMulti ? [] : '';

    const group = document.createElement('div');
    group.className = 'quick-replies';
    group.dataset.groupIdx = gIdx;

    // 问题标签
    if (q.text) {
      const label = document.createElement('span');
      label.className = 'quick-reply-label';
      label.textContent = q.text + (isMulti ? '（可多选）' : '');
      group.appendChild(label);
    }

    // 选项按钮
    for (const opt of q.options) {
      const btn = document.createElement('button');
      btn.className = 'quick-reply-chip';
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        if (isMulti) {
          // 多选：toggle 单个 chip
          btn.classList.toggle('selected');
          const arr = [];
          group.querySelectorAll('.quick-reply-chip.selected').forEach(b => arr.push(b.textContent));
          selections[gIdx] = arr;
        } else {
          // 单选：取消同组其他选中
          group.querySelectorAll('.quick-reply-chip').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selections[gIdx] = opt;
        }
        // 如果有输入框，清空它
        const inp = group.querySelector('.quick-reply-input');
        if (inp) inp.value = '';
        updateConfirmBtn();
      });
      group.appendChild(btn);
    }

    // 可选：自定义输入框
    if (q.allowInput) {
      const inputWrap = document.createElement('div');
      inputWrap.className = 'quick-reply-input-wrap';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'quick-reply-input';
      input.placeholder = q.inputPlaceholder || '请输入';

      input.addEventListener('input', () => {
        const val = input.value.trim();
        const isMulti = !!q.multiSelect;
        if (val) {
          if (!isMulti) {
            // 单选：有输入时取消 chip 选中
            group.querySelectorAll('.quick-reply-chip').forEach(b => b.classList.remove('selected'));
          }
          // 输入值追加到多选或替代单选
          if (isMulti) {
            const arr = [];
            group.querySelectorAll('.quick-reply-chip.selected').forEach(b => arr.push(b.textContent));
            arr.push(val);
            selections[gIdx] = arr;
          } else {
            selections[gIdx] = val;
          }
        } else {
          // 清空时恢复 chip 选择
          if (isMulti) {
            const arr = [];
            group.querySelectorAll('.quick-reply-chip.selected').forEach(b => arr.push(b.textContent));
            selections[gIdx] = arr;
          } else {
            const sel = group.querySelector('.quick-reply-chip.selected');
            selections[gIdx] = sel ? sel.textContent : '';
          }
        }
        updateConfirmBtn();
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          // Enter 时如果所有都已填就直接确认
          if (canConfirm()) doConfirm();
        }
      });

      inputWrap.appendChild(input);
      group.appendChild(inputWrap);
    }

    wrapper.appendChild(group);
  });

  // ── 确认按钮 ──
  const confirmRow = document.createElement('div');
  confirmRow.className = 'quick-replies-confirm';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'quick-reply-confirm-btn';
  confirmBtn.textContent = '确认提交';
  confirmBtn.disabled = true;
  confirmBtn.addEventListener('click', doConfirm);
  confirmRow.appendChild(confirmBtn);
  wrapper.appendChild(confirmRow);

  function canConfirm() {
    // 只要有至少一组有选择就可以确认
    return Object.values(selections).some(v => Array.isArray(v) ? v.length > 0 : v !== '');
  }

  function updateConfirmBtn() {
    confirmBtn.disabled = !canConfirm();
  }

  function doConfirm() {
    if (!canConfirm()) return;

    // 禁用所有组件
    wrapper.querySelectorAll('.quick-reply-chip').forEach(b => {
      b.disabled = true;
      if (!b.classList.contains('selected')) b.classList.add('used');
    });
    wrapper.querySelectorAll('.quick-reply-input').forEach(inp => inp.disabled = true);
    confirmBtn.disabled = true;
    confirmBtn.classList.add('used');

    // 拼接所有回答为一条消息
    const parts = [];
    groups.forEach((q, gIdx) => {
      const answer = selections[gIdx];
      const hasAnswer = Array.isArray(answer) ? answer.length > 0 : answer !== '';
      if (hasAnswer) {
        const answerText = Array.isArray(answer) ? answer.join('、') : answer;
        // 如果问题有标签，用「标签：答案」格式；否则只放答案
        if (q.text) {
          const label = q.text.replace(/[？?]/g, '');
          parts.push(`${label}：${answerText}`);
        } else {
          parts.push(answerText);
        }
      }
    });

    const combined = parts.join('，');
    document.getElementById('msg-input').value = combined;
    sendMessage();
  }

  // 嵌入气泡内部，让选项和正文融为一体
  bubble.appendChild(wrapper);
  scrollToBottom();
}

function groupLabel(name, total, done) {
  const icons = { search_flights: '✈️', search_hotels: '🏨', web_search: '🔍' };
  const nouns = { search_flights: '条航线', search_hotels: '家酒店', web_search: '次搜索' };
  const verbs = { search_flights: '机票', search_hotels: '酒店', web_search: '资料' };
  const icon = icons[name] || '🔍';
  const noun = nouns[name] || '条结果';
  const verb = verbs[name] || '信息';
  if (done >= total) {
    return `✅ ${icon} 已完成 ${total} ${noun}`;
  }
  if (done === 0) {
    return `${icon} 正在查询${verb}…`;
  }
  return `${icon} 正在查询${verb}… (${done}/${total})`;
}

function toolLabel(name, args) {
  // 无 args 时只返回工具名（用于完成状态）
  if (!args) {
    const nameMap = {
      web_search: '🔍 网页搜索',
      get_weather: '🌤️ 天气查询',
      get_exchange_rate: '💱 汇率查询',
      search_poi: '📍 地点搜索',
      search_flights: '✈️ 机票搜索',
      search_hotels: '🏨 酒店搜索',
      cache_destination_knowledge: '📚 缓存目的地知识',
      update_trip_info: '📋 更新行程参考书'
    };
    return nameMap[name] || name;
  }
  // 有 args 时显示具体内容
  switch (name) {
    case 'web_search':
      return `🔍 搜索「${args.query || ''}」`;
    case 'get_weather':
      return `🌤️ 查询 ${args.city || ''} 天气`;
    case 'get_exchange_rate':
      return `💱 查询 ${args.from || ''}→${args.to || 'CNY'} 汇率`;
    case 'search_poi':
      return `📍 搜索地点「${args.keyword || args.query || ''}」${args.city ? ' · ' + args.city : ''}`;
    case 'search_flights':
      return `✈️ 查询 ${args.origin || ''}→${args.destination || ''} ${args.date || ''} 机票`;
    case 'search_hotels':
      return `🏨 搜索 ${args.city || ''} ${args.check_in || ''} 酒店`;
    case 'cache_destination_knowledge':
      return `📚 缓存「${args.destination || ''}」知识`;
    case 'update_trip_info':
      return '📋 更新行程参考书';
    default:
      return name;
  }
}

// ============================================================
// 汇率缓存（localStorage，跨会话复用）
// ============================================================
const RATE_CACHE_KEY = 'tp_rate_cache';
const RATE_TTL = 4 * 60 * 60 * 1000; // 4 小时

function loadRateCache() {
  try {
    const raw = localStorage.getItem(RATE_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

function saveRateToCache(rateData) {
  const cache = loadRateCache();
  const key = `${rateData.from}_${rateData.to}`;
  cache[key] = { ...rateData, fetched_at: rateData.fetched_at || Date.now() };
  localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(cache));
}

function getFreshRates() {
  const now = Date.now();
  const cache = loadRateCache();
  return Object.values(cache).filter(r => r.fetched_at && (now - r.fetched_at) < RATE_TTL);
}

// ============================================================
// 天气缓存（localStorage，跨会话复用）
// ============================================================
const WEATHER_CACHE_KEY = 'tp_weather_cache';
const WEATHER_TTL = 3 * 60 * 60 * 1000; // 3 小时

function loadWeatherCache() {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

function saveWeatherToCache(weatherData) {
  const cache = loadWeatherCache();
  const key = (weatherData.city || '').toLowerCase().trim();
  cache[key] = { ...weatherData, fetched_at: weatherData.fetched_at || Date.now() };
  localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(cache));
}

function getFreshWeather() {
  const now = Date.now();
  const cache = loadWeatherCache();
  return Object.values(cache).filter(w => w.fetched_at && (now - w.fetched_at) < WEATHER_TTL);
}

// ============================================================
// 行程历史管理
// ============================================================
const TRIPS_KEY = 'tp_trips';

function loadTrips() {
  try {
    return JSON.parse(localStorage.getItem(TRIPS_KEY) || '[]');
  } catch { return []; }
}

function saveTrips(trips) {
  localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
}

function generateTripTitle() {
  const firstUser = chatHistory.find(m => m.role === 'user');
  if (!firstUser) return '未命名行程';
  return firstUser.content.trim().substring(0, 24) + (firstUser.content.length > 24 ? '…' : '');
}

function saveTripSnapshot() {
  if (chatHistory.length === 0) return;
  const trips = loadTrips();
  const now = Date.now();
  
  // Capture latest TripBook state
  let tripBookSnapshot = {};
  try {
    const stored = sessionStorage.getItem('tp_tripbook_snapshot')
                 || sessionStorage.getItem('tp_tripbook');
    if (stored) tripBookSnapshot = JSON.parse(stored);
  } catch {}
  
  if (currentTripId) {
    const idx = trips.findIndex(t => t.id === currentTripId);
    if (idx !== -1) {
      trips[idx].messages = [...chatHistory];
      trips[idx].updatedAt = now;
      trips[idx].title = generateTripTitle();
      trips[idx].tripBookSnapshot = tripBookSnapshot;  // ← ADD THIS LINE
      saveTrips(trips);
      return;
    }
  }
  // 新行程
  const newTrip = {
    id: 'trip_' + now + '_' + Math.random().toString(36).slice(2, 7),
    title: generateTripTitle(),
    createdAt: now,
    updatedAt: now,
    messages: [...chatHistory],
    tripBookSnapshot: tripBookSnapshot  // ← ADD THIS LINE
  };
  currentTripId = newTrip.id;
  trips.unshift(newTrip);
  saveTrips(trips);
}

function deleteTrip(id, event) {
  event.stopPropagation();
  const trips = loadTrips().filter(t => t.id !== id);
  saveTrips(trips);
  if (currentTripId === id) {
    currentTripId = null;
    chatHistory = [];
    resetToWelcome();
  }
  renderHistoryList();
}

function loadTripById(id) {
  const trips = loadTrips();
  const trip = trips.find(t => t.id === id);
  if (!trip) return;
  currentTripId = trip.id;
  chatHistory = [...trip.messages];
  restoreChatUI();
  
  // Restore TripBook snapshot if available
  if (trip.tripBookSnapshot && Object.keys(trip.tripBookSnapshot).length > 0) {
    try {
      const snap = trip.tripBookSnapshot;
      // 如果是完整快照（有 constraints 字段），分别设置
      if (snap.constraints || snap.itinerary) {
        sessionStorage.setItem('tp_tripbook_snapshot', JSON.stringify(snap));
      } else {
        // 旧格式面板数据，直接用
        sessionStorage.setItem('tp_tripbook', JSON.stringify(snap));
      }
      // Update itinerary panel from restored snapshot
      if (typeof updateFromTripBook === 'function') {
        updateFromTripBook(snap);
      }
    } catch (e) {
      console.warn('Failed to restore TripBook snapshot:', e);
    }
  }
  
  toggleHistory();
  renderHistoryList();
}

function restoreChatUI() {
  const chatArea = document.getElementById('chat-area');
  chatArea.innerHTML = '';
  for (const msg of chatHistory) {
    if (msg.role === 'user') {
      const div = document.createElement('div');
      div.className = 'message user';
      div.innerHTML = `<div class="avatar user-avatar">✈</div><div class="bubble">${escapeHtml(msg.content)}</div>`;
      chatArea.appendChild(div);
    } else if (msg.role === 'assistant') {
      const div = document.createElement('div');
      div.className = 'message assistant';
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.innerHTML = renderMarkdown(msg.content);
      div.innerHTML = '<div class="avatar ai-avatar">🌍</div>';
      div.appendChild(bubble);
      chatArea.appendChild(div);
    }
  }
  scrollToBottom();
}

function resetToWelcome() {
  const chatArea = document.getElementById('chat-area');
  chatArea.innerHTML = `
    <div class="welcome-msg">
      <div class="welcome-card">
        <span class="welcome-icon">🌍</span>
        <h2>你好，我是 AI 旅行规划师</h2>
        <p class="welcome-sub"><span>告诉我你想去哪里，我帮你从零到一规划旅行。</span></p>
        <div class="welcome-caps">
          <span class="welcome-cap">✈️ 实时机票</span>
          <span class="welcome-cap">🌤️ 天气预报</span>
          <span class="welcome-cap">💱 汇率转换</span>
          <span class="welcome-cap">📍 景点餐厅</span>
        </div>
        <div class="quick-starts">
          <button class="quick-btn" onclick="sendQuickStart('帮我规划一个7天的日本东京+京都+大阪之旅，想体验文化美食和购物')">🗼 日本东京·京都·大阪</button>
          <button class="quick-btn" onclick="sendQuickStart('帮我规划一个10天的西欧之旅，包括法国巴黎和意大利罗马，预算2万左右')">🗺️ 西欧巴黎·罗马之旅</button>
          <button class="quick-btn" onclick="sendQuickStart('我想五一去马来西亚沙巴玩，想体验潜水和雨林，帮我规划一下')">🏝️ 马来西亚沙巴潜水</button>
          <button class="quick-btn" onclick="sendQuickStart('帮我规划一个5天的泰国清迈+曼谷之旅，喜欢寺庙文化和街头美食')">🍜 泰国清迈·曼谷</button>
        </div>
      </div>
    </div>
  `;
}

function renderHistoryList() {
  const container = document.getElementById('history-list');
  const trips = loadTrips();
  if (trips.length === 0) {
    container.innerHTML = `<div class="history-empty"><p>📭</p><p>暂无保存的行程</p><p>开始规划后将自动保存</p></div>`;
    return;
  }
  container.innerHTML = trips.map(trip => {
    const date = new Date(trip.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    const msgCount = trip.messages.filter(m => m.role === 'user').length;
    const isActive = trip.id === currentTripId ? ' active-trip' : '';
    return `
      <div class="trip-card${isActive}" onclick="loadTripById('${trip.id}')">
        <button class="trip-card-delete" onclick="deleteTrip('${trip.id}', event)" title="删除">✕</button>
        <div class="trip-card-title">${escapeHtml(trip.title)}</div>
        <div class="trip-card-meta">
          <span>📅 ${date}</span>
          <span>💬 ${msgCount} 条对话</span>
        </div>
      </div>
    `;
  }).join('');
}

function toggleHistory() {
  const panel = document.getElementById('history-panel');
  const overlay = document.getElementById('history-overlay');
  if (!panel.classList.contains('active')) {
    renderHistoryList();
  }
  panel.classList.toggle('active');
  overlay.classList.toggle('active');
}

// ============================================================
// DOM 操作
// ============================================================
function appendUserMessage(text) {
  const chatArea = document.getElementById('chat-area');
  const div = document.createElement('div');
  div.className = 'message user';
  div.innerHTML = `
    <div class="avatar user-avatar">✈</div>
    <div class="bubble">${escapeHtml(text)}</div>
  `;
  chatArea.appendChild(div);
  scrollToBottom();
}

function appendAssistantMessage() {
  const chatArea = document.getElementById('chat-area');

  // 消息容器
  const div = document.createElement('div');
  div.className = 'message assistant';

  // 头像
  const avatar = document.createElement('div');
  avatar.className = 'avatar ai-avatar';
  avatar.textContent = '🌍';
  div.appendChild(avatar);

  // 消息主体（工具状态 + 气泡）
  const body = document.createElement('div');
  body.className = 'message-body';

  // 工具状态容器（位于气泡上方，属于同一消息）
  const toolContainer = document.createElement('div');
  toolContainer.className = 'tool-container';
  body.appendChild(toolContainer);

  // 文字气泡
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  body.appendChild(bubble);

  div.appendChild(body);
  chatArea.appendChild(div);
  scrollToBottom();

  return { bubble, toolContainer };
}

function hideWelcome() {
  const w = document.querySelector('.welcome-msg');
  if (w) w.remove();
}

function clearChat() {
  // 保存当前对话（如有内容）
  saveTripSnapshot();
  chatHistory = [];
  currentTripId = null;
  resetToWelcome();
  // 同步清空行程面板
  if (typeof clearItinerary === 'function') clearItinerary();
  // 清空 TripBook 缓存
  try {
    sessionStorage.removeItem('tp_tripbook');
    sessionStorage.removeItem('tp_tripbook_snapshot');
  } catch {}
}

// ============================================================
// 滚动管理：流式输出时允许用户自由上划，滚回底部后恢复自动滚动
// ============================================================
let userScrolledUp = false;

function showScrollHint() {
  let btn = document.getElementById('scroll-hint');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'scroll-hint';
    btn.textContent = '↓ 跳到最新';
    btn.onclick = () => {
      userScrolledUp = false;
      hideScrollHint();
      const chatArea = document.getElementById('chat-area');
      chatArea.scrollTop = chatArea.scrollHeight;
    };
    document.querySelector('.chat-panel').appendChild(btn);
  }
  btn.classList.add('visible');
}

function hideScrollHint() {
  const btn = document.getElementById('scroll-hint');
  if (btn) btn.classList.remove('visible');
}

(function initScrollWatcher() {
  const chatArea = document.getElementById('chat-area');
  chatArea.addEventListener('scroll', () => {
    if (!isStreaming) { userScrolledUp = false; hideScrollHint(); return; }
    const distFromBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
    userScrolledUp = distFromBottom > 20;
    if (userScrolledUp) showScrollHint(); else hideScrollHint();
  });
})();

function scrollToBottom() {
  if (userScrolledUp) return;
  const chatArea = document.getElementById('chat-area');
  chatArea.scrollTop = chatArea.scrollHeight;
}

// ============================================================
// Markdown 简易渲染器
// ============================================================
function renderMarkdown(text) {
  // ── 提取 <think> 块，先保护起来避免被 escapeHtml 破坏 ──
  const thinkBlocks = [];
  text = text.replace(/<think>([\s\S]*?)(<\/think>|$)/g, (_, content, closing) => {
    const idx = thinkBlocks.length;
    thinkBlocks.push({ content: content.trim(), closed: closing === '</think>' });
    return `%%THINK_${idx}%%`;
  });

  let html = escapeHtml(text);

  // code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>');
  // inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // bold & italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // hr
  html = html.replace(/^---$/gm, '<hr>');
  // unordered list
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  // ordered list
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // tables
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match.split('|').filter(c => c.trim());
    if (cells.every(c => /^[-:]+$/.test(c.trim()))) return '';
    const tag = 'td';
    return '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
  });
  html = html.replace(/(<tr>.*<\/tr>[\s]*)+/g, '<table>$&</table>');
  // 清除 table 内部的换行符，防止后续段落转换把 </p><p> 插入 <tr> 之间（会导致浏览器把孤立 <p> 移到表格外，形成视觉间距）
  html = html.replace(/<table>([\s\S]*?)<\/table>/g, (_, inner) => '<div class="table-wrapper"><table>' + inner.replace(/\n/g, '') + '</table></div>');
  // paragraphs — 先折叠多余空行，再转换
  html = html.replace(/\n{3,}/g, '\n\n');   // 3+ 空行 → 1 个空行
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  // cleanup: 块级元素前后的多余 <br> / 空 <p>
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<br>\s*)+<\/p>/g, '');
  // 块元素后紧跟的 <br>
  html = html.replace(/(<\/h[1-3]>|<\/div>|<\/table>|<\/ul>|<\/ol>|<hr>)(<br>)+/g, '$1');
  // 块元素前紧跟的 <br>
  html = html.replace(/(<br>)+(<h[1-3]>|<div class="table-wrapper">|<table>|<ul>|<ol>|<hr>)/g, '$2');
  // 块元素被多余 <p> 包裹
  html = html.replace(/<p>(<h[1-3]>|<div class="table-wrapper">|<table>|<ul>|<ol>)/g, '$1');
  html = html.replace(/(<\/h[1-3]>|<\/div>|<\/table>|<\/ul>|<\/ol>)<\/p>/g, '$1');

  // ── 还原 <think> 块为可折叠的"思考过程" ──
  html = html.replace(/%%THINK_(\d+)%%/g, (_, idx) => {
    const block = thinkBlocks[parseInt(idx)];
    if (!block) return '';
    // 对思考内容做简单 markdown 渲染（递归调用会死循环，手动处理关键格式）
    let inner = escapeHtml(block.content);
    inner = inner.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    inner = inner.replace(/\*(.+?)\*/g, '<em>$1</em>');
    inner = inner.replace(/\n/g, '<br>');
    const spinner = block.closed ? '' : '<div class="thinking-spinner"><span></span><span></span><span></span></div>';
    return `<details class="think-block${block.closed ? '' : ' thinking'}"><summary>💭 思考过程${block.closed ? '' : '（思考中…）'}</summary><div class="think-content">${inner}${spinner}</div></details>`;
  });

  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// 初始化
// ============================================================
(function init() {
  // 如果没有设置API Key，自动打开设置面板
  const s = loadSettings();
  if (!s.apiKey) {
    setTimeout(() => toggleSettings(), 500);
  }

  // 页面关闭/刷新前自动保存当前对话
  window.addEventListener('beforeunload', () => {
    saveTripSnapshot();
  });
})();
