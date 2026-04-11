#!/usr/bin/env python3
"""
机票搜索脚本 — 使用 fast-flights 抓取 Google Flights
接收 JSON 参数（stdin），输出 JSON 结果（stdout）
"""
import sys
import json
import re

def parse_price_usd(price_str):
    """从 '$165' 等字符串提取数字，返回 float 或 None"""
    if not price_str:
        return None
    m = re.search(r'[\d,]+\.?\d*', str(price_str).replace(',', ''))
    return float(m.group()) if m else None

def main():
    try:
        params = json.loads(sys.stdin.read())
    except:
        print(json.dumps({"error": "参数解析失败"}))
        return

    origin = params.get("origin", "")
    destination = params.get("destination", "")
    date = params.get("date", "")
    passengers = int(params.get("passengers", 1))

    if not origin or not destination or not date:
        print(json.dumps({"error": "缺少必要参数: origin, destination, date"}))
        return

    try:
        from fast_flights import FlightData, Passengers, get_flights

        flight_data = FlightData(
            date=date,
            from_airport=origin,
            to_airport=destination
        )

        result = None
        last_error = None

        # 依次尝试各种 fetch_mode，直到成功
        for mode in ['common', 'local', 'fallback']:
            try:
                result = get_flights(
                    flight_data=[flight_data],
                    trip='one-way',
                    passengers=Passengers(adults=passengers),
                    seat='economy',
                    fetch_mode=mode
                )
                if result and result.flights:
                    break
                last_error = f"mode={mode} 返回空结果"
                result = None
            except Exception as e:
                last_error = f"mode={mode} 失败: {str(e)}"
                result = None

        if not result or not result.flights:
            print(json.dumps({
                "error": "机票数据获取失败，所有抓取模式均未返回结果",
                "detail": last_error or "未知原因",
                "suggestion": "请使用 web_search 工具搜索该航线机票价格，例如搜索：'{origin} to {destination} {date} flight price site:skyscanner.com'".format(
                    origin=origin, destination=destination, date=date
                )
            }))
            return

        # 去重（以出发时间+到达时间+航司为唯一键）
        seen = set()
        flights = []
        for f in result.flights:
            dep = getattr(f, "departure", "") or ""
            arr = getattr(f, "arrival", "") or ""
            price_raw = getattr(f, "price", "") or ""
            airline = (getattr(f, "name", "") or "").strip()
            stops = getattr(f, "stops", 0)
            duration = getattr(f, "duration", "") or ""
            is_best = getattr(f, "is_best", False)

            # 跳过出发/到达时间均为空的幽灵条目（无实际航班信息）
            if not dep.strip() and not arr.strip():
                continue

            # 解析价格（可能为 None，表示"Price unavailable"）
            price_usd = parse_price_usd(price_raw)
            # 跳过价格明确为 0 的占位条目（不同于 unavailable）
            if price_usd is not None and price_usd <= 0:
                continue

            key = (dep.strip(), arr.strip(), airline)
            if key in seen:
                continue
            seen.add(key)

            flights.append({
                "airline": airline,
                "departure": dep.strip(),
                "arrival": arr.strip(),
                "duration": duration.strip(),
                "stops": stops,
                "price_usd": price_usd,            # None 表示价格不可用
                "price": price_raw.strip() if price_usd else "Price unavailable",
                "is_best": is_best
            })

        # 排序：有价格的排前面（按价格升序），无价格的排后面
        flights.sort(key=lambda x: (x["price_usd"] is None, x["price_usd"] or 0))

        if not flights:
            print(json.dumps({
                "error": "未找到任何航班",
                "suggestion": f"请使用 web_search 工具搜索：{origin} to {destination} {date} flight"
            }))
            return

        print(json.dumps({
            "origin": origin,
            "destination": destination,
            "date": date,
            "currency": "USD",
            "flights": flights,
            "total_results": len(flights)
        }, ensure_ascii=False))

    except ImportError:
        print(json.dumps({"error": "fast-flights 未安装，请运行: pip3 install fast-flights"}))
    except Exception as e:
        print(json.dumps({
            "error": f"搜索失败: {str(e)}",
            "suggestion": f"请使用 web_search 工具搜索：{origin} to {destination} {date} cheapest flight price"
        }))

if __name__ == "__main__":
    main()
