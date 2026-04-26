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
import urllib.parse

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
    for k in ("SUPABASE_SERVICE_ROLE_KEY", "NAVER_NCLOUD_KEY_ID", "NAVER_NCLOUD_KEY_SECRET"):
        if not env.get(k):
            env[k] = os.environ.get(k, "")
    if not env["SUPABASE_SERVICE_ROLE_KEY"]:
        sys.exit("SUPABASE_SERVICE_ROLE_KEY missing")
    if not env.get("NAVER_NCLOUD_KEY_ID") or not env.get("NAVER_NCLOUD_KEY_SECRET"):
        sys.exit("NAVER_NCLOUD_KEY_ID / NAVER_NCLOUD_KEY_SECRET missing")
    return env


def _element_by_type(elements, type_name):
    if not elements:
        return None
    for e in elements:
        if type_name in (e.get("types") or []):
            return e.get("longName")
    return None


def geocode(query: str, env: dict) -> dict | None:
    """ NCloud Maps Geocoding — 정확도 ↑, ~10 req/s """
    if not query or not query.strip():
        return None
    url = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=" + urllib.parse.quote(query.strip())
    req = urllib.request.Request(url, headers={
        "x-ncp-apigw-api-key-id": env["NAVER_NCLOUD_KEY_ID"],
        "x-ncp-apigw-api-key": env["NAVER_NCLOUD_KEY_SECRET"],
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="replace")[:200]
        except Exception:
            body = ""
        print(f"  [geocode HTTP {e.code}] {query!r} - {body}")
        return None
    except Exception as e:
        print(f"  [geocode err] {query!r} - {e}")
        return None
    addrs = data.get("addresses") or []
    if not addrs:
        return None
    a = addrs[0]
    try:
        lat = float(a["y"])
        lng = float(a["x"])
    except (KeyError, ValueError):
        return None
    elems = a.get("addressElements")
    return {
        "lat": lat,
        "lng": lng,
        "sido": _element_by_type(elems, "SIDO"),
        "sigungu": _element_by_type(elems, "SIGUGUN"),
        "bname": _element_by_type(elems, "DONGMYUN") or _element_by_type(elems, "RI"),
        "road_address": a.get("roadAddress") or a.get("jibunAddress"),
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
        time.sleep(0.1)  # NCloud rate-friendly
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
        time.sleep(0.1)  # NCloud rate-friendly
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
