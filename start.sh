#!/bin/bash
# AI Travel Planner — 一键启动脚本

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# 安装依赖
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
  echo ""
  echo "📦 正在安装依赖..."
  npm install --silent
  echo -e "${GREEN}✓ 依赖安装完成${NC}"
else
  echo -e "${GREEN}✓ 依赖已安装${NC}"
fi

PORT=${PORT:-3002}
URL="http://localhost:$PORT"

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
if [ -f ".env" ]; then
  node --env-file=.env server.js
else
  node server.js
fi
