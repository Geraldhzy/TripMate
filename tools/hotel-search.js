/**
 * 酒店搜索工具 — 调用 Python Playwright 脚本获取 Google Hotels 报价
 */
const { spawn } = require('child_process');
const path = require('path');

const TOOL_DEF = {
  name: 'search_hotels',
  description: '搜索指定城市和日期的酒店价格。返回酒店名称、每晚价格（USD）、评分。价格为美元，需配合 get_exchange_rate 转换为人民币。',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名（英文），如 Kuala Lumpur, Kota Kinabalu, Semporna' },
      checkin: { type: 'string', description: '入住日期，格式 YYYY-MM-DD' },
      checkout: { type: 'string', description: '退房日期，格式 YYYY-MM-DD' }
    },
    required: ['city', 'checkin', 'checkout']
  }
};

function execute(params) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'scripts', 'search_hotels.py');
    const child = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 70000
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0 || !stdout.trim()) {
        resolve(JSON.stringify({
          error: `酒店搜索脚本执行失败 (code=${code})`,
          detail: stderr.substring(0, 500) || '无输出',
          suggestion: '请确保已安装 playwright: pip3 install playwright && python3 -m playwright install chromium'
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
