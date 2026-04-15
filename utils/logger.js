/**
 * 结构化日志系统
 *
 * 功能：
 * - 日志级别 (DEBUG, INFO, WARN, ERROR)
 * - 请求 ID 追踪（贯穿整个请求生命周期）
 * - 计时辅助（自动计算耗时）
 * - 结构化 JSON 输出（方便后续接入日志平台）
 * - 子 Agent 上下文关联
 *
 * 使用方式：
 *   const logger = require('./utils/logger');
 *   const reqLogger = logger.child({ reqId: 'abc123' });
 *   reqLogger.info('处理请求', { provider: 'openai' });
 *
 *   const timer = reqLogger.startTimer('llm_call');
 *   // ... do work ...
 *   timer.done({ tokens: 150 });  // 自动附加 durationMs
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── 日志级别 ───
const LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 99
};

// 从环境变量读取，默认 INFO
const ENV_LEVEL = (process.env.LOG_LEVEL || 'INFO').toUpperCase();
const currentLevel = LEVELS[ENV_LEVEL] ?? LEVELS.INFO;

// 是否输出 JSON 格式（生产环境推荐），默认 false 使用可读格式
const JSON_FORMAT = process.env.LOG_JSON === 'true';

// 是否输出到终端（由 LOG_STDOUT 环境变量控制，默认 true）
const LOG_STDOUT = process.env.LOG_STDOUT !== 'false';

// ─── 日志文件 ───
const LOG_DIR = path.join(process.cwd(), 'logs');
let logFileStream = null;
let errFileStream = null;

function initLogFiles() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    logFileStream = fs.createWriteStream(path.join(LOG_DIR, `app-${dateStr}.log`), { flags: 'a' });
    errFileStream = fs.createWriteStream(path.join(LOG_DIR, `error-${dateStr}.log`), { flags: 'a' });

    // 清理 7 天前的日志文件
    cleanOldLogs();
  } catch (err) {
    console.error('Failed to initialize log files:', err.message);
  }
}

function cleanOldLogs() {
  try {
    const files = fs.readdirSync(LOG_DIR);
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    for (const f of files) {
      const fp = path.join(LOG_DIR, f);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(fp);
      }
    }
  } catch {}
}

initLogFiles();

// ─── 颜色代码（终端可读格式用） ───
const COLORS = {
  DEBUG: '\x1b[36m',  // cyan
  INFO: '\x1b[32m',   // green
  WARN: '\x1b[33m',   // yellow
  ERROR: '\x1b[31m',  // red
  RESET: '\x1b[0m'
};

// ─── 图标 ───
const ICONS = {
  DEBUG: '🔍',
  INFO: '✅',
  WARN: '⚠️',
  ERROR: '❌'
};

/**
 * 生成短 ID（8字符）
 */
function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * 格式化持续时间
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

/**
 * 安全地截断长字符串用于日志
 */
function truncate(str, maxLen = 200) {
  if (typeof str !== 'string') return str;
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + `...(${str.length}字符)`;
}

/**
 * 核心日志输出
 */
function writeLog(level, context, message, data) {
  if (LEVELS[level] < currentLevel) return;

  const timestamp = new Date().toISOString();

  // 构建上下文标签（终端和文件共用）
  const tags = [];
  if (context.reqId) tags.push(`req:${context.reqId}`);
  if (context.agent) tags.push(`agent:${context.agent}`);
  if (context.tool) tags.push(`tool:${context.tool}`);
  const tagStr = tags.length > 0 ? `[${tags.join(' ')}] ` : '';

  // 构建数据部分
  let dataStr = '';
  if (data && Object.keys(data).length > 0) {
    const parts = [];
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'string' && v.length > 200) {
        parts.push(`${k}=${truncate(v)}`);
      } else if (typeof v === 'object') {
        parts.push(`${k}=${JSON.stringify(v)}`);
      } else {
        parts.push(`${k}=${v}`);
      }
    }
    if (parts.length > 0) dataStr = ' | ' + parts.join(', ');
  }

  const timeStr = timestamp.slice(11, 23); // HH:MM:SS.mmm

  // ── 写入日志文件（始终执行） ──
  const fileLine = `${timestamp} ${level.padEnd(5)} ${tagStr}${message}${dataStr}\n`;
  try {
    if (level === 'ERROR' && errFileStream) {
      errFileStream.write(fileLine);
    }
    // 所有级别都写入 app 日志
    if (logFileStream) {
      logFileStream.write(fileLine);
    }
  } catch {}

  // ── 写入终端（受 LOG_STDOUT 控制） ──
  if (!LOG_STDOUT) return;

  if (JSON_FORMAT) {
    const entry = {
      ts: timestamp,
      level,
      ...context,
      msg: message,
      ...data
    };
    const stream = level === 'ERROR' ? process.stderr : process.stdout;
    stream.write(JSON.stringify(entry) + '\n');
  } else {
    const color = COLORS[level] || '';
    const icon = ICONS[level] || '';
    const reset = COLORS.RESET;
    const line = `${color}${timeStr} ${icon} ${level.padEnd(5)}${reset} ${tagStr}${message}${dataStr}`;
    const stream = level === 'ERROR' ? process.stderr : process.stdout;
    stream.write(line + '\n');
  }
}

/**
 * Logger 实例 — 带上下文的日志记录器
 */
class Logger {
  constructor(context = {}) {
    this.context = context;
  }

  /**
   * 创建子 Logger，继承父级上下文
   * @param {Object} extraContext - 附加上下文
   * @returns {Logger}
   */
  child(extraContext) {
    return new Logger({ ...this.context, ...extraContext });
  }

  debug(msg, data) { writeLog('DEBUG', this.context, msg, data); }
  info(msg, data) { writeLog('INFO', this.context, msg, data); }
  warn(msg, data) { writeLog('WARN', this.context, msg, data); }
  error(msg, data) { writeLog('ERROR', this.context, msg, data); }

  /**
   * 启动计时器
   * @param {string} operation - 操作名称（如 'llm_call', 'tool_exec'）
   * @returns {{ done: Function, elapsed: Function }}
   */
  startTimer(operation) {
    const start = Date.now();
    const self = this;

    return {
      /**
       * 结束计时并输出 INFO 日志
       * @param {Object} extraData - 附加数据
       */
      done(extraData = {}) {
        const durationMs = Date.now() - start;
        self.info(`${operation} 完成`, {
          operation,
          durationMs,
          duration: formatDuration(durationMs),
          ...extraData
        });
        return durationMs;
      },

      /**
       * 获取当前已耗时（不输出日志）
       */
      elapsed() {
        return Date.now() - start;
      }
    };
  }
}

// ─── 导出 ───
const rootLogger = new Logger();

module.exports = {
  // 根 Logger（无上下文）
  ...rootLogger,
  debug: rootLogger.debug.bind(rootLogger),
  info: rootLogger.info.bind(rootLogger),
  warn: rootLogger.warn.bind(rootLogger),
  error: rootLogger.error.bind(rootLogger),
  startTimer: rootLogger.startTimer.bind(rootLogger),

  // 创建子 Logger
  child: rootLogger.child.bind(rootLogger),

  // 工具函数
  generateId,
  formatDuration,
  truncate,

  // 常量
  LEVELS
};
