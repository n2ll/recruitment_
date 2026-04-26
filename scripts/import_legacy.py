#!/usr/bin/env python3
"""
옹고잉 이력서 제출 양식.csv → Supabase applicants 통합

사용법:
  python scripts/import_legacy.py --dry-run        # 첫 5행만 출력, DB 쓰기 없음
  python scripts/import_legacy.py --dry-run --rows 10
  python scripts/import_legacy.py --execute        # 실제 DB 삽입

전제: SUPABASE_SERVICE_ROLE_KEY 환경변수 또는 .env.local 에서 자동 로드
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from pathlib import Path

import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "옹고잉 이력서 제출 양식.csv"

SUPABASE_URL = "https://lrktxyfzxwwpjffzltnq.supabase.co"


def load_service_key() -> str:
    """ 환경변수 우선, 없으면 .env.local 파싱 """
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if key:
        return key
    env_path = ROOT / ".env.local"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY not found")


# ── 변환 헬퍼 ─────────────────────────────────────────────────────────


def clean_phone(raw: str) -> str | None:
    """ 자릿수 검증된 휴대폰 (10~11자리). Excel CSV의 leading zero 손실 보정. """
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    # 앞자리 0 손실 보정: 10자리 + '1'시작이면 010 prefix
    if len(digits) == 10 and digits.startswith("1"):
        digits = "0" + digits
    if 10 <= len(digits) <= 11 and digits.startswith("0"):
        return digits
    return None


def clean_birth(raw: str) -> str | None:
    """ 6자리 숫자만, 월/일 검증 """
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if len(digits) != 6:
        return None
    mm = int(digits[2:4])
    dd = int(digits[4:6])
    if not (1 <= mm <= 12) or not (1 <= dd <= 31):
        return None
    return digits


def parse_submitted_at(raw: str) -> str | None:
    """
    '2024-01-30 4:58:13' → ISO. CSV는 KST 기준이라고 가정해 +09:00 부착.
    """
    if not raw:
        return None
    raw = raw.strip()
    # 흔한 포맷 대응
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M:%S"):
        try:
            from datetime import datetime
            dt = datetime.strptime(raw, fmt)
            return dt.strftime("%Y-%m-%dT%H:%M:%S+09:00")
        except ValueError:
            continue
    return None


def parse_available_date(raw: str) -> str | None:
    if not raw:
        return None
    raw = raw.strip()
    # ISO 'YYYY-MM-DD' 또는 'YYYY/MM/DD'
    m = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})", raw)
    if m:
        y, mo, d = m.groups()
        return f"{y}-{int(mo):02d}-{int(d):02d}"
    return None


def map_own_vehicle(raw: str) -> str:
    """ '예/아니요' → '있음/없음', 빈값 → '없음' """
    if not raw:
        return "없음"
    if "예" in raw or "네" in raw:
        return "있음"
    return "없음"


def map_self_ownership(raw: str) -> str:
    if not raw:
        return "미입력"
    if "예" in raw or "네" in raw:
        return "문제 없음"
    return "문제 있음 (지원불가)"


def join_address(addr: str, sigungu: str, dong: str) -> str:
    parts = [p.strip() for p in (addr, sigungu, dong) if p and p.strip()]
    return " ".join(parts)


def build_introduction(row: dict) -> str:
    """ 여러 에세이 컬럼을 라벨 붙여서 introduction 1개로 합치기 """
    sections = [
        ("운전 능력 강점", row.get("운전 능력'에 대해서 본인의 강점을 상세히 서술해주세요.")),
        ("핸드폰 사용 강점", row.get("핸드폰 사용 능력'에 대해서 본인의 강점을 상세히 서술해주세요.")),
        ("체력 강점", row.get(" 체력'에 대해서 본인의 강점을 상세하게 서술해주세요.")),
        ("의사소통 강점", row.get("의사소통 능력'에 대해서 본인의 강점을 상세하게 서술해주세요.")),
        ("직업관", row.get("자신의 '직업관'이 무엇인지 상세히 서술해주세요. ")),
        ("옹고잉 인식", row.get("옹고잉은 어떤 곳이라 생각하시나요?그리고 본인과 옹고잉이 어떤 점에서 잘 맞을 거라 생각하시나요?상세히 서술해주세요.")),
        ("유사 업무", row.get("배송 업무와 유사한 일을 하신 적 있으신가요?상세히 서술해주세요.")),
        ("기대 사항", row.get("옹고잉과 함께 일을 하게 된다면 가장 기대하는 바는 무엇인가요?상세히 서술해주세요.")),
    ]
    parts = []
    for label, text in sections:
        if text and text.strip():
            parts.append(f"[{label}]\n{text.strip()}")
    return "\n\n".join(parts)


def build_note(row: dict) -> str:
    parts = ["legacy_import"]
    extra_q = row.get("궁금하신 사항 있으시면 자유롭게 작성해주세요.", "").strip()
    if extra_q:
        parts.append(f"[궁금사항] {extra_q}")
    extra_reason = row.get("이상이 있다면 사유를 작성해주세요.", "").strip()
    if extra_reason:
        parts.append(f"[정산 이상 사유] {extra_reason}")
    return " | ".join(parts)


# ── 행 변환 메인 ─────────────────────────────────────────────────────


def transform_row(row: dict) -> tuple[dict | None, str | None]:
    """
    Returns (payload, error). 필수 필드 못 채우면 error 반환.
    """
    name = (row.get("성함을 작성해주세요") or "").strip()
    if not name:
        return None, "name 누락"

    phone = clean_phone(row.get("연락처를 작성해주세요.", ""))
    if not phone:
        return None, "phone 누락 또는 형식 오류"

    birth = clean_birth(row.get("생년월일 작성해주세요.(주민번호 앞6자리)", ""))
    if not birth:
        return None, "birth_date 누락 또는 형식 오류"

    location = join_address(
        row.get("거주지", ""),
        row.get("시/군/구를 선택해주세요.", ""),
        row.get("나머지 주소(동/면/리)를 작성해주세요.", ""),
    )

    own_vehicle = map_own_vehicle(row.get("자차로 업무를 진행하실 의향이 있으신가요?\n(자차로 업무 진행 시 인센티브가 지급됩니다)", ""))
    license_type = (row.get("소지한 운전면허를 선택해주세요") or "").strip() or "없음"
    vehicle_type = (row.get("차량 종류를 작성해주세요.") or "").strip() or "미입력"
    self_ownership = map_self_ownership(row.get("급여를 본인 계좌로 지급 받는데 이상은 없나요?", ""))

    # PGRST102 회피: 모든 행이 동일한 키 집합을 가져야 bulk insert 가능
    payload = {
        "name": name,
        "birth_date": birth,
        "phone": phone,
        "email": (row.get("이메일 주소를 입력해주세요.") or "").strip() or None,
        "location": location or None,
        "own_vehicle": own_vehicle,
        "license_type": license_type,
        "vehicle_type": vehicle_type,
        "available_date": parse_available_date(row.get("업무 투입 가능한 날짜 또는 희망 날짜를 선택해주세요.", "")),
        "self_ownership": self_ownership,
        "introduction": build_introduction(row) or None,
        "experience": (row.get("경력 사항을 작성해주세요") or "").strip() or None,
        "note": build_note(row),
        "legacy_data": row,
        "submitted_at": parse_submitted_at(row.get("Submitted at", "")),
    }

    return payload, None


# ── Supabase 호출 ─────────────────────────────────────────────────────


TARGET_TABLE = "legacy_applicants"


def existing_phones(service_key: str) -> set[str]:
    """ 이미 legacy_applicants 테이블에 있는 phone 셋 (재실행 시 중복 방지) """
    url = f"{SUPABASE_URL}/rest/v1/{TARGET_TABLE}?select=phone&limit=10000"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            rows = json.loads(r.read().decode("utf-8"))
        return {r["phone"] for r in rows if r.get("phone")}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"[ERROR] 테이블 '{TARGET_TABLE}'가 존재하지 않습니다.")
            print("        먼저 supabase-migration-legacy.sql을 SQL Editor에서 실행하세요.")
            sys.exit(1)
        raise


def insert_batch(service_key: str, payloads: list[dict]) -> tuple[int, str | None]:
    """ Supabase REST POST. 성공 시 (count, None), 실패 시 (0, error) """
    if not payloads:
        return 0, None
    body = json.dumps(payloads, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{TARGET_TABLE}",
        data=body,
        method="POST",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            r.read()
        return len(payloads), None
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        return 0, f"HTTP {e.code}: {err_body[:300]}"


# ── 메인 ──────────────────────────────────────────────────────────────


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--execute", action="store_true")
    p.add_argument("--rows", type=int, default=5, help="dry-run 행 수")
    p.add_argument("--batch", type=int, default=50, help="execute 배치 크기")
    p.add_argument("--out", type=str, default=None, help="dry-run 결과를 UTF-8 파일로 저장")
    args = p.parse_args()

    # Windows 콘솔 cp949 mojibake 방지
    if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
        try:
            sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except Exception:
            pass

    if not args.dry_run and not args.execute:
        p.error("--dry-run 또는 --execute 중 하나 필요")

    if not CSV_PATH.exists():
        sys.exit(f"CSV not found: {CSV_PATH}")

    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"[INFO] CSV 행 수: {len(rows)}")

    # 변환 단계
    converted = []
    errors = []
    for i, row in enumerate(rows, 1):
        payload, err = transform_row(row)
        if err:
            errors.append((i, err, (row.get("성함을 작성해주세요") or "").strip(), row.get("연락처를 작성해주세요.", "")))
        else:
            converted.append(payload)

    print(f"[INFO] 변환 성공: {len(converted)}, 변환 실패: {len(errors)}")
    if errors[:10]:
        print("[WARN] 변환 실패 샘플 (최대 10건):")
        for idx, err, name, phone in errors[:10]:
            print(f"  - 행{idx}: {err} (이름={name!r} 폰={phone!r})")

    if args.dry_run:
        sample = converted[: args.rows]
        report = {
            "csv_total": len(rows),
            "converted": len(converted),
            "errors": len(errors),
            "error_samples": [
                {"row": idx, "reason": err, "name": name, "phone": phone}
                for idx, err, name, phone in errors[:30]
            ],
            "sample_payloads": [
                {**{k: v for k, v in p_.items() if k != "legacy_data"},
                 "legacy_data_keys_count": len(p_["legacy_data"])}
                for p_ in sample
            ],
        }
        if args.out:
            Path(args.out).write_text(
                json.dumps(report, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            print(f"[OK] dry-run 결과 저장: {args.out}")
        else:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    # ── execute ──
    service_key = load_service_key()
    print(f"[INFO] 기존 phone 조회 중...")
    existing = existing_phones(service_key)
    print(f"[INFO] 기존 phone {len(existing)}개")

    new_payloads = []
    skipped_dup = 0
    for p_ in converted:
        if p_["phone"] in existing:
            skipped_dup += 1
            continue
        new_payloads.append(p_)

    print(f"[INFO] 중복 skip: {skipped_dup}, 신규 삽입 대상: {len(new_payloads)}")

    inserted = 0
    failed = 0
    for i in range(0, len(new_payloads), args.batch):
        batch = new_payloads[i : i + args.batch]
        ok, err = insert_batch(service_key, batch)
        if err:
            print(f"[ERROR] 배치 {i}~{i+len(batch)}: {err}")
            failed += len(batch)
        else:
            inserted += ok
            print(f"[OK] {i+ok}/{len(new_payloads)}")
        time.sleep(0.2)

    print(f"\n=== 결과 ===")
    print(f"변환 성공: {len(converted)} / 변환 실패: {len(errors)}")
    print(f"중복 skip: {skipped_dup}")
    print(f"DB 삽입: {inserted} / 실패: {failed}")


if __name__ == "__main__":
    main()
