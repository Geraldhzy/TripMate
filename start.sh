#!/bin/bash
# AI Travel Planner — 一键启动脚本
# 用法: ./start.sh [--debug]
#   --debug  启用调试模式：终端输出日志 + DEBUG 级别
#   默认模式：终端不输出日志（日志始终保存到 logs/ 目录）

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 解析参数
DEBUG_MODE=false
for arg in "$@"; do
  case "$arg" in
    --debug|-d)
      DEBUG_MODE=true
      ;;
  esac
done

echo ""
echo -e "${BLUE}🌍 AI Travel Planner${NC}"
echo "================================"

# 检查 Node.js
if ! command -v node &> /dev/null; then
  echo -e "${YELLOW}⚠️  未检测到 Node.js，请先安装：https://nodejs.org${NC}"
  exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [ "$NODE_VER" -lt 18 ]; then
  echo -e "${YELLOW}⚠️  Node.js 版本过低（当前 v${NODE_VER}），需要 v18 或以上${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v) / npm $(npm -v)${NC}"

# 检查 Python3
if ! command -v python3 &> /dev/null; then
  echo -e "${YELLOW}⚠️  未检测到 Python3（机票/酒店搜索需要），请安装：https://www.python.org${NC}"
else
  echo -e "${GREEN}✓ Python $(python3 --version 2>&1 | awk '{print $2}')${NC}"
fi

# 安装 Node.js 依赖
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
  echo ""
  echo "📦 正在安装 Node.js 依赖..."
  npm install --silent
  echo -e "${GREEN}✓ Node.js 依赖安装完成${NC}"
else
  echo -e "${GREEN}✓ Node.js 依赖已安装${NC}"
fi

# 安装 Python 依赖（机票搜索 + 酒店搜索）
if command -v python3 &> /dev/null && command -v pip3 &> /dev/null; then
  if ! python3 -c "import fast_flights" 2>/dev/null; then
    echo "📦 正在安装 Python 依赖 (fast-flights)..."
    pip3 install -q fast-flights 2>/dev/null && echo -e "${GREEN}✓ fast-flights 已安装${NC}" || echo -e "${YELLOW}⚠️  fast-flights 安装失败，机票搜索功能不可用${NC}"
  else
    echo -e "${GREEN}✓ fast-flights 已安装${NC}"
  fi
  if ! python3 -c "import playwright" 2>/dev/null; then
    echo "📦 正在安装 Python 依赖 (playwright)..."
    pip3 install -q playwright 2>/dev/null && python3 -m playwright install chromium 2>/dev/null && echo -e "${GREEN}✓ playwright 已安装${NC}" || echo -e "${YELLOW}⚠️  playwright 安装失败，酒店搜索功能不可用${NC}"
  else
    echo -e "${GREEN}✓ playwright 已安装${NC}"
  fi
fi

PORT=3002

PORT=${PORT:-3002}
URL="http://localhost:$PORT"

# 设置日志环境变量
if [ "$DEBUG_MODE" = true ]; then
  export LOG_STDOUT=true
  export LOG_LEVEL=DEBUG
  echo -e "${YELLOW}🐛 调试模式：终端输出日志 + 保存到 logs/ 目录${NC}"
else
  echo -e "${GREEN}✓ 静默模式（使用 --debug 开启日志）${NC}"
fi

echo ""
echo -e "🚀 启动服务于 ${BLUE}${URL}${NC}"
echo "   按 Ctrl+C 停止"
echo ""

# 后台稍等再打开浏览器（等服务器就绪）
(
  sleep 2
  if command -v open &> /dev/null; then
    open "$URL"
  elif command -v xdg-open &> /dev/null; then
    xdg-open "$URL"
  elif command -v start &> /dev/null; then
    start "$URL"
  fi
) &

# 启动服务
node --max-old-space-size=1024 --no-deprecation server.js
