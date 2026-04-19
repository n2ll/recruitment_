-- ============================================================
-- 알림톡 전환 + 상태 추적 통합 마이그레이션
-- 실행 방법: Supabase SQL Editor에 전체 붙여넣기 후 Run
-- https://supabase.com/dashboard/project/lrktxyfzxwwpjffzltnq/sql/new
-- ============================================================

-- ───────────────────────────────────────────────────
-- 1. messages 테이블 — 발송 유형 추적
-- ───────────────────────────────────────────────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'sms';
  -- 'sms' | 'alimtalk' | 'friendtalk'
ALTER TABLE messages ADD COLUMN IF NOT EXISTS template_id TEXT;
  -- 어떤 알림톡 템플릿으로 나갔는지

-- ───────────────────────────────────────────────────
-- 2. applicants 테이블 — 리마인더 / 마케팅 / 채널 친구
-- ───────────────────────────────────────────────────
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
  -- 리마인더 중복 발송 방지

ALTER TABLE applicants ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ;
  -- 마케팅 수신동의 (완료 페이지 체크박스)

ALTER TABLE applicants ADD COLUMN IF NOT EXISTS kakao_channel_friend BOOLEAN DEFAULT FALSE;
  -- 카카오 채널 친구 여부 (친구톡 발송 대상 판단)

-- ───────────────────────────────────────────────────
-- 3. applicants 테이블 — 확정 정보 (슬롯/시작일)
-- ───────────────────────────────────────────────────
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS start_date DATE;
  -- 확정된 근무 시작일

ALTER TABLE applicants ADD COLUMN IF NOT EXISTS confirmed_slot TEXT;
  -- '평일오전' | '평일오후' | '주말오전' | '주말오후'

ALTER TABLE applicants ADD COLUMN IF NOT EXISTS confirmed_branch TEXT;
  -- 실제 배치된 지점 (branch1과 다를 수 있음)

-- ───────────────────────────────────────────────────
-- 4. applicants 테이블 — 이탈/재활용 관리
-- ───────────────────────────────────────────────────
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS current_branch TEXT;
  -- 현재 근무 중 지점 (null = 비근무)

ALTER TABLE applicants ADD COLUMN IF NOT EXISTS churned_at TIMESTAMPTZ;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS churn_reason TEXT;

-- ───────────────────────────────────────────────────
-- 5. applicants 테이블 — 출근 확인 응답
-- ───────────────────────────────────────────────────
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS attendance_response TEXT;
  -- 'confirmed' | 'declined' | null
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS attendance_response_at TIMESTAMPTZ;

-- ───────────────────────────────────────────────────
-- 6. 인덱스 (필터/집계 성능용)
-- ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_applicants_confirmed_slot ON applicants (confirmed_slot);
CREATE INDEX IF NOT EXISTS idx_applicants_current_branch ON applicants (current_branch);
CREATE INDEX IF NOT EXISTS idx_applicants_start_date ON applicants (start_date);
CREATE INDEX IF NOT EXISTS idx_applicants_reminder_sent ON applicants (reminder_sent_at);

-- ───────────────────────────────────────────────────
-- 확인 쿼리 (실행 후 컬럼 존재 확인)
-- ───────────────────────────────────────────────────
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'applicants'
-- ORDER BY ordinal_position;
