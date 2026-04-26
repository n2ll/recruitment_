-- ============================================================
-- 레거시 지원자 데이터 통합 — 별도 테이블 (운영 applicants 미오염)
-- 실행: Supabase SQL Editor
-- https://supabase.com/dashboard/project/lrktxyfzxwwpjffzltnq/sql/new
-- ============================================================

CREATE TABLE IF NOT EXISTS legacy_applicants (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at          TIMESTAMPTZ,                  -- 원본 CSV 제출 시각

  -- 표준 매핑 필드
  name                  TEXT NOT NULL,
  birth_date            TEXT,
  phone                 TEXT NOT NULL,
  email                 TEXT,

  location              TEXT,
  own_vehicle           TEXT,
  license_type          TEXT,
  vehicle_type          TEXT,
  available_date        DATE,
  self_ownership        TEXT,

  introduction          TEXT,                         -- 에세이 컬럼들 라벨링 병합
  experience            TEXT,
  note                  TEXT,

  -- CSV 원본 47개 컬럼 통째 보존 (향후 SQL JSON 쿼리로 추출 가능)
  legacy_data           JSONB,

  -- 향후 이 사람을 정식 풀(applicants)로 옮겼을 때 연결
  promoted_applicant_id BIGINT REFERENCES applicants(id)
);

-- 검색 인덱스 (재컨택 시 phone/name으로 빠른 조회)
CREATE INDEX IF NOT EXISTS idx_legacy_applicants_phone ON legacy_applicants (phone);
CREATE INDEX IF NOT EXISTS idx_legacy_applicants_name ON legacy_applicants (name);
CREATE INDEX IF NOT EXISTS idx_legacy_applicants_submitted ON legacy_applicants (submitted_at);
CREATE INDEX IF NOT EXISTS idx_legacy_applicants_license ON legacy_applicants (license_type);

-- RLS (admin only)
ALTER TABLE legacy_applicants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role full access" ON legacy_applicants;
CREATE POLICY "service_role full access"
  ON legacy_applicants FOR ALL
  USING (true) WITH CHECK (true);

-- 확인 쿼리
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'legacy_applicants' ORDER BY ordinal_position;
