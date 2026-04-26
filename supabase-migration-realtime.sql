-- ============================================================
-- Realtime 활성화 — applicants/messages/device_heartbeat
-- 실행: Supabase SQL Editor
-- https://supabase.com/dashboard/project/lrktxyfzxwwpjffzltnq/sql/new
-- ============================================================

-- 1) Realtime publication에 테이블 추가
--    (이미 추가돼 있으면 에러 없이 무시)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE applicants;
  EXCEPTION WHEN duplicate_object THEN
    -- 이미 추가됨
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  EXCEPTION WHEN duplicate_object THEN
    -- 이미 추가됨
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE device_heartbeat;
  EXCEPTION WHEN duplicate_object THEN
    -- 이미 추가됨
  END;
END $$;

-- 2) UPDATE/DELETE 이벤트의 페이로드에 전체 행을 포함하기 위해
--    REPLICA IDENTITY FULL 설정
ALTER TABLE applicants REPLICA IDENTITY FULL;
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE device_heartbeat REPLICA IDENTITY FULL;

-- 3) RLS — anon key로 SELECT 허용 (추후 admin 인증 붙일 때 강화 예정)
ALTER TABLE applicants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read applicants" ON applicants;
CREATE POLICY "anon read applicants"
  ON applicants FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "anon read messages" ON messages;
CREATE POLICY "anon read messages"
  ON messages FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "anon read heartbeat" ON device_heartbeat;
CREATE POLICY "anon read heartbeat"
  ON device_heartbeat FOR SELECT
  TO anon, authenticated
  USING (true);

-- 확인 쿼리:
-- SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
