/**
 * 机票搜索工具 — 调用 Python fast-flights 脚本获取 Google Flights 精确报价
 */
const { spawn } = require('child_process');
const path = require('path');

const TOOL_DEF = {
  name: 'search_flights',
  description: '搜索指定日期航线的机票精确报价。返回航司、出发到达时间、飞行时长、经停数、价格（USD）。价格为美元，需配合 get_exchange_rate 转换为人民币。',
  parameters: {
    type: 'object',
    properties: {
      origin: { type: 'string', description: '出发机场IATA代码，如 MFM（澳门）、CAN（广州）、PEK（北京）' },
      destination: { type: 'string', description: '目的地机场IATA代码，如 TWU（斗湖）、KUL（吉隆坡）、BKI（亚庇）' },
      date: { type: 'string', description: '出发日期，格式 YYYY-MM-DD' },
      passengers: { type: 'number', description: '乘客人数，默认1', default: 1 }
    },
    required: ['origin', 'destination', 'date']
  }
};

function execute(params) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'scripts', 'search_flights.py');
    const child = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0 || !stdout.trim()) {
        resolve(JSON.stringify({
          error: `机票搜索脚本执行失败 (code=${code})`,
          detail: stderr.substring(0, 500) || '无输出',
          suggestion: '请确保已安装 fast-flights: pip3 install fast-flights'
        }));
        return;
      }
      try {
        JSON.parse(stdout);
        resolve(stdout.trim());
      } catch {
        resolve(JSON.stringify({ error: '返回数据格式错误', raw: stdout.substring(0, 500) }));
      }
    });

    child.on('error', (err) => {
      resolve(JSON.stringify({ error: `无法启动Python: ${err.message}` }));
    });

    child.stdin.write(JSON.stringify(params));
    child.stdin.end();
  });
}

module.exports = { TOOL_DEF, execute };
