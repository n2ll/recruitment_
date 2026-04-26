#!/usr/bin/env python3
"""
일괄 지오코딩 — applicants / legacy_applicants 중 좌표 없는 행 일괄 처리

사용법:
  python scripts/geocode_all.py --target applicants    # 신규 지원자 누락분
  python scripts/geocode_all.py --target legacy        # 레거시 355명
  python scripts/geocode_all.py --target all           # 둘 다

전제: SUPABASE_SERVICE_ROLE_KEY + KAKAO_REST_API_KEY 가 .env.local에 있음
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parent.parent
SUPABASE_URL = "https://lrktxyfzxwwpjffzltnq.supabase.co"


def load_env() -> dict:
    env: dict = {}
    env_path = ROOT / ".env.local"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    for k in ("SUPABASE_SERVICE_ROLE_KEY",):
        if not env.get(k):
            env[k] = os.environ.get(k, "")
    if not env["SUPABASE_SERVICE_ROLE_KEY"]:
        sys.exit("SUPABASE_SERVICE_ROLE_KEY missing")
    return env


def geocode(query: str, env: dict) -> dict | None:
    """ OSM Nominatim — 가입 불필요, 1초/요청 제한 """
    if not query or not query.strip():
        return None
    url = (
        "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1"
        "&accept-language=ko&limit=1&q=" + urllib.request.quote(query.strip())
    )
    req = urllib.request.Request(url, headers={
        "User-Agent": "ongoing-recruitment/1.0 (info@naeyil.com)",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"  [geocode HTTP {e.code}] {query!r}")
        return None
    except Exception as e:
        print(f"  [geocode err] {query!r} - {e}")
        return None
    if not data:
        return None
    r0 = data[0]
    try:
        lat = float(r0["lat"])
        lng = float(r0["lon"])
    except (KeyError, ValueError):
        return None
    a = r0.get("address") or {}
    return {
        "lat": lat,
        "lng": lng,
        "sido": a.get("state") or a.get("province") or a.get("region"),
        "sigungu": a.get("city") or a.get("county") or a.get("borough"),
        "bname": a.get("suburb") or a.get("neighbourhood") or a.get("quarter"),
        "road_address": a.get("road") or r0.get("display_name"),
    }


def supabase_get(path: str, service_key: str) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def supabase_patch(table: str, row_id, patch: dict, service_key: str, id_col: str = "id"):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{id_col}=eq.{urllib.request.quote(str(row_id))}"
    body = json.dumps(patch, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="PATCH",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        r.read()


def process_applicants(env: dict):
    rows = supabase_get(
        "applicants?select=id,name,location&lat=is.null&limit=10000",
        env["SUPABASE_SERVICE_ROLE_KEY"],
    )
    print(f"[applicants] 좌표 없는 행: {len(rows)}")
    success = 0
    for i, row in enumerate(rows, 1):
        loc = row.get("location") or ""
        if not loc.strip() or loc.strip() in ("미입력",):
            continue
        result = geocode(loc, env)
        if not result:
            print(f"  [{i}/{len(rows)}] id={row['id']} {row.get('name')!r} 실패: {loc!r}")
            continue
        supabase_patch("applicants", row["id"], result, env["SUPABASE_SERVICE_ROLE_KEY"])
        success += 1
        if i % 20 == 0 or i == len(rows):
            print(f"  [{i}/{len(rows)}] 성공 누적 {success}")
        time.sleep(1.05)  # OSM Nominatim policy: 1 req/sec
    print(f"[applicants] 완료: {success}/{len(rows)}")


def best_address_from_legacy(row: dict) -> str:
    """
    legacy_applicants의 location은 'sido + sigungu + bname' 합친 값일 수 있고
    또는 legacy_data 안에 더 구체적인 동/면/리 정보가 있음.
    """
    location = (row.get("location") or "").strip()
    if location and location not in ("미입력",):
        return location
    legacy = row.get("legacy_data") or {}
    if isinstance(legacy, str):
        try:
            legacy = json.loads(legacy)
        except Exception:
            legacy = {}
    parts = [
        (legacy.get("거주지") or "").strip(),
        (legacy.get("시/군/구를 선택해주세요.") or "").strip(),
        (legacy.get("나머지 주소(동/면/리)를 작성해주세요.") or "").strip(),
    ]
    return " ".join(p for p in parts if p)


def process_legacy(env: dict):
    rows = supabase_get(
        "legacy_applicants?select=id,name,location,legacy_data&lat=is.null&limit=10000",
        env["SUPABASE_SERVICE_ROLE_KEY"],
    )
    print(f"[legacy] 좌표 없는 행: {len(rows)}")
    success = 0
    for i, row in enumerate(rows, 1):
        addr = best_address_from_legacy(row)
        if not addr:
            continue
        result = geocode(addr, env)
        if not result:
            continue
        supabase_patch("legacy_applicants", row["id"], result, env["SUPABASE_SERVICE_ROLE_KEY"])
        success += 1
        if i % 20 == 0 or i == len(rows):
            print(f"  [{i}/{len(rows)}] 성공 누적 {success}")
        time.sleep(1.05)  # OSM Nominatim policy: 1 req/sec
    print(f"[legacy] 완료: {success}/{len(rows)}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--target", choices=["applicants", "legacy", "all"], required=True)
    args = p.parse_args()

    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        try:
            sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except Exception:
            pass

    env = load_env()
    if args.target in ("applicants", "all"):
        process_applicants(env)
    if args.target in ("legacy", "all"):
        process_legacy(env)


if __name__ == "__main__":
    main()
