#!/usr/bin/env python3
"""
酒店搜索脚本 — 使用 playwright 抓取 Google Hotels
接收 JSON 参数（stdin），输出 JSON 结果（stdout）
"""
import sys
import json
import re

def main():
    try:
        params = json.loads(sys.stdin.read())
    except:
        print(json.dumps({"error": "参数解析失败"}))
        return

    city = params.get("city", "")
    checkin = params.get("checkin", "")
    checkout = params.get("checkout", "")

    if not city or not checkin or not checkout:
        print(json.dumps({"error": "缺少必要参数: city, checkin, checkout"}))
        return

    try:
        from playwright.sync_api import sync_playwright

        url = f"https://www.google.com/travel/hotels/{city}?q={city}+hotels&dates={checkin}_{checkout}&hl=en&gl=us&currency=USD"

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_extra_http_headers({"Accept-Language": "en-US,en;q=0.9"})
            page.goto(url, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(3000)

            hotels = []

            # 尝试提取酒店卡片
            cards = page.query_selector_all('[data-hveid] .uaTTDe, [jsname="mutHjb"]')
            if not cards:
                cards = page.query_selector_all('.Hkjgbb, .kCsInf')

            for card in cards[:10]:
                text = card.inner_text()
                lines = [l.strip() for l in text.split('\n') if l.strip()]

                name = lines[0] if lines else "Unknown"
                price = ""
                rating = ""

                for line in lines:
                    if '$' in line or '¥' in line:
                        price_match = re.search(r'[\$¥]\s*[\d,]+', line)
                        if price_match:
                            price = price_match.group()
                    if re.match(r'^\d\.\d', line):
                        rating = line.split()[0]

                if name and name != "Unknown":
                    hotels.append({
                        "name": name,
                        "price_per_night": price,
                        "rating": rating,
                    })

            browser.close()

            if not hotels:
                # fallback: 用web搜索获取参考价格
                print(json.dumps({
                    "city": city,
                    "checkin": checkin,
                    "checkout": checkout,
                    "hotels": [],
                    "note": "无法从Google Hotels获取数据，建议使用web_search搜索酒店价格",
                    "search_url": f"https://www.google.com/travel/hotels/{city}?dates={checkin}_{checkout}"
                }, ensure_ascii=False))
            else:
                print(json.dumps({
                    "city": city,
                    "checkin": checkin,
                    "checkout": checkout,
                    "currency": "USD",
                    "hotels": hotels,
                    "total_results": len(hotels)
                }, ensure_ascii=False))

    except ImportError as e:
        if 'playwright' in str(e):
            print(json.dumps({"error": "playwright 未安装，请运行: pip3 install playwright && playwright install chromium"}))
        else:
            print(json.dumps({"error": f"依赖缺失: {str(e)}"}))
    except Exception as e:
        print(json.dumps({"error": f"搜索失败: {str(e)}"}))

if __name__ == "__main__":
    main()
