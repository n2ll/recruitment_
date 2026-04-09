-- messages 테이블 (없으면 생성)
CREATE TABLE IF NOT EXISTS messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id int8 REFERENCES applicants(id),
    applicant_phone text NOT NULL,
    direction text NOT NULL DEFAULT 'inbound',
    body text NOT NULL,
    status text NOT NULL DEFAULT 'received',
    sent_by text,
    solapi_msg_id text,
    device_id text,
    raw_payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- device_heartbeat 테이블 (없으면 생성)
CREATE TABLE IF NOT EXISTS device_heartbeat (
    device_id text PRIMARY KEY,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    pending_count int NOT NULL DEFAULT 0,
    battery_level int NOT NULL DEFAULT -1,
    app_version text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- applicants 테이블에 컬럼 추가
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS last_message_at timestamptz;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS unread_count int NOT NULL DEFAULT 0;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_messages_applicant_id ON messages(applicant_id);
CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(applicant_phone);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_heartbeat ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow all messages" ON messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow all heartbeat" ON device_heartbeat FOR ALL USING (true) WITH CHECK (true);

-- 새 inbound 메시지 수신 시 applicants 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_applicant_on_message()
RETURNS trigger AS $$
BEGIN
  IF NEW.applicant_id IS NOT NULL AND NEW.direction = 'inbound' THEN
    UPDATE applicants
    SET last_message_at = NEW.created_at,
        unread_count = unread_count + 1
    WHERE id = NEW.applicant_id;
  END IF;

  -- applicant_id 없으면 phone으로 매칭
  IF NEW.applicant_id IS NULL THEN
    UPDATE messages
    SET applicant_id = (SELECT id FROM applicants WHERE phone = NEW.applicant_phone LIMIT 1)
    WHERE id = NEW.id;

    IF NEW.direction = 'inbound' THEN
      UPDATE applicants
      SET last_message_at = NEW.created_at,
          unread_count = unread_count + 1
      WHERE phone = NEW.applicant_phone;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_applicant_on_message ON messages;
CREATE TRIGGER trg_update_applicant_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_applicant_on_message();
