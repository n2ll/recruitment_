-- ============================================================
-- legacy_applicants에 부적합 플래그 추가
-- 실행: Supabase SQL Editor
-- https://supabase.com/dashboard/project/lrktxyfzxwwpjffzltnq/sql/new
-- ============================================================
-- 향후 새 부적합 규칙(차량 미보유 + 차량 필수 등)도 여기에 누적 가능.

ALTER TABLE legacy_applicants ADD COLUMN IF NOT EXISTS disqualified BOOLEAN DEFAULT FALSE;
ALTER TABLE legacy_applicants ADD COLUMN IF NOT EXISTS disqualified_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_legacy_disqualified ON legacy_applicants (disqualified);

-- 확인
-- SELECT count(*) FILTER (WHERE disqualified) AS disqualified_count,
--        count(*) FILTER (WHERE NOT disqualified OR disqualified IS NULL) AS active_count
-- FROM legacy_applicants;
