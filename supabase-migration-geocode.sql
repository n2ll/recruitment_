-- ============================================================
-- 지오코딩 인프라 — 후보자 주소 정규화 + 좌표 저장
-- 실행: Supabase SQL Editor
-- https://supabase.com/dashboard/project/lrktxyfzxwwpjffzltnq/sql/new
-- ============================================================
-- 추천 점수화 시 거리 계산용. 공고별 상차지 주소는 매니저가 입력 (별도 테이블 불필요).
-- ============================================================

-- 1) applicants에 좌표/시군구 컬럼
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS lat NUMERIC;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS lng NUMERIC;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS sido TEXT;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS sigungu TEXT;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS bname TEXT;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS road_address TEXT;

CREATE INDEX IF NOT EXISTS idx_applicants_sigungu ON applicants (sigungu);
CREATE INDEX IF NOT EXISTS idx_applicants_lat_lng ON applicants (lat, lng);

-- 2) legacy_applicants에 동일 컬럼
ALTER TABLE legacy_applicants ADD COLUMN IF NOT EXISTS lat NUMERIC;
ALTER TABLE legacy_applicants ADD COLUMN IF NOT EXISTS lng NUMERIC;
ALTER TABLE legacy_applicants ADD COLUMN IF NOT EXISTS sido TEXT;
ALTER TABLE legacy_applicants ADD COLUMN IF NOT EXISTS sigungu TEXT;
ALTER TABLE legacy_applicants ADD COLUMN IF NOT EXISTS bname TEXT;
ALTER TABLE legacy_applicants ADD COLUMN IF NOT EXISTS road_address TEXT;

CREATE INDEX IF NOT EXISTS idx_legacy_sigungu ON legacy_applicants (sigungu);
CREATE INDEX IF NOT EXISTS idx_legacy_lat_lng ON legacy_applicants (lat, lng);

-- 확인
-- SELECT count(*) FROM applicants WHERE lat IS NOT NULL;
-- SELECT count(*) FROM legacy_applicants WHERE lat IS NOT NULL;
