#!/usr/bin/env python3
"""
机票搜索脚本 — 使用 fast-flights 抓取 Google Flights
接收 JSON 参数（stdin），输出 JSON 结果（stdout）
"""
import sys
import json
import re
import warnings
import os

# 抑制 primp/fast-flights 的 Impersonate 警告输出
warnings.filterwarnings("ignore")
# 部分库通过 stderr 输出警告，重定向 stderr 以避免干扰 JSON 输出
_original_stderr = sys.stderr
sys.stderr = open(os.devnull, 'w')


def parse_price_usd(price_str):
    """从 '$165' 等字符串提取数字，返回 float 或 None"""
    if not price_str:
        return None
    s = str(price_str)
    # "Price unavailable" 或类似文本 → None
    if 'unavailable' in s.lower() or 'unknown' in s.lower():
        return None
    m = re.search(r'[\d,]+\.?\d*', s.replace(',', ''))
    return float(m.group()) if m else None


def parse_stops(stops_val):
    """将 stops 转为整数，兼容 int/str/'Unknown'/None"""
    if stops_val is None:
        return None
    if isinstance(stops_val, int):
        return stops_val
    s = str(stops_val).strip().lower()
    if s in ('0', 'nonstop', 'direct'):
        return 0
    m = re.search(r'\d+', s)
    if m:
        return int(m.group())
    return None  # 'Unknown' 等无法解析的情况


def main():
    try:
        params = json.loads(sys.stdin.read())
    except Exception:
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

        # ── 连通性检测：先快速测试 Google Flights 是否可达 ──
        import urllib.request
        try:
            req = urllib.request.Request(
                'https://www.google.com/travel/flights',
                headers={'User-Agent': 'Mozilla/5.0'}
            )
            urllib.request.urlopen(req, timeout=5)
        except Exception:
            # Google Flights 不可达，直接返回建议用 web_search 兜底
            print(json.dumps({
                "error": "Google Flights 无法访问（网络不通或被屏蔽）",
                "suggestion": f"请使用 web_search 工具搜索机票价格，例如搜索：'{origin} to {destination} {date} flight price site:skyscanner.com' 或 '{origin} {destination} {date} 机票价格'",
                "fallback": True
            }))
            return

        flight_data = FlightData(
            date=date,
            from_airport=origin,
            to_airport=destination
        )

        result = None
        last_error = None

        # 依次尝试各种 fetch_mode，直到成功
        for mode in ['common', 'fallback', 'force-fallback']:
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
            dep = str(getattr(f, "departure", "") or "").strip()
            arr = str(getattr(f, "arrival", "") or "").strip()
            price_raw = str(getattr(f, "price", "") or "").strip()
            airline = str(getattr(f, "name", "") or "").strip()
            stops = parse_stops(getattr(f, "stops", None))
            duration = str(getattr(f, "duration", "") or "").strip()
            is_best = bool(getattr(f, "is_best", False))

            # 只跳过完全无用的条目：既无航司又无时间又无价格
            if not dep and not arr and not airline and not price_raw:
                continue

            # 解析价格（可能为 None，表示"Price unavailable"）
            price_usd = parse_price_usd(price_raw)
            # 跳过价格明确为 0 的占位条目（不同于 unavailable）
            if price_usd is not None and price_usd <= 0:
                continue

            # 跳过信息严重缺失的条目（只有价格但没航司也没时间，对用户没有参考价值）
            if (not airline or airline == '未知航司') and (not dep or dep == '时间未知') and (not arr or arr == '时间未知'):
                continue

            # 去重键：优先用出发+到达+航司，若时间缺失则用航司+价格
            if dep or arr:
                key = (dep, arr, airline)
            else:
                key = (airline, price_raw)
            if key in seen:
                continue
            seen.add(key)

            flights.append({
                "airline": airline or "未知航司",
                "departure": dep or "时间未知",
                "arrival": arr or "时间未知",
                "duration": duration or "未知",
                "stops": stops,
                "price_usd": price_usd,
                "price": price_raw if price_usd else "Price unavailable",
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
