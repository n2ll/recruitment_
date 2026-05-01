-- AI 에이전트 자동 답변 초안 저장 테이블
-- 인입 SMS마다 Claude가 생성하는 답변 초안. 매니저 검토 후 발송 여부 결정.

CREATE TABLE IF NOT EXISTS message_drafts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  applicant_id        INT8 REFERENCES applicants(id) ON DELETE SET NULL,
  applicant_phone     TEXT NOT NULL,
  draft_text          TEXT,
  reasoning           TEXT,
  missing_info        TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  used_message_id     UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  CONSTRAINT chk_drafts_status CHECK (
    status IN ('pending', 'used', 'edited', 'ignored', 'need_info', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_drafts_applicant_status
  ON message_drafts (applicant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drafts_inbound
  ON message_drafts (inbound_message_id);
CREATE INDEX IF NOT EXISTS idx_drafts_pending
  ON message_drafts (created_at DESC)
  WHERE status IN ('pending', 'need_info');

-- RLS — admin/service만 접근
ALTER TABLE message_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS drafts_service_all ON message_drafts;
CREATE POLICY drafts_service_all ON message_drafts FOR ALL USING (true) WITH CHECK (true);

-- Realtime publication 추가 (admin UI 실시간 구독용)
ALTER PUBLICATION supabase_realtime ADD TABLE message_drafts;
