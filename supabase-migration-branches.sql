-- 지점 마스터 테이블
-- /apply의 지점 드롭다운, /admin의 지점 필터·통계 등 모든 지점 목록의 단일 소스.
-- applicants.branch 컬럼은 FK가 아닌 이름 문자열을 그대로 저장(레거시 호환).

CREATE TABLE IF NOT EXISTS branches (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branches_active_sort
  ON branches (active, sort_order);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION trg_branches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS branches_set_updated_at ON branches;
CREATE TRIGGER branches_set_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION trg_branches_updated_at();

-- 초기 12개 지점 시드 (현재 하드코딩 순서 유지)
INSERT INTO branches (name, sort_order) VALUES
  ('은평',       10),
  ('마포상암',   20),
  ('서대문신촌', 30),
  ('용산한남',   40),
  ('도봉쌍문',   50),
  ('중구명동',   60),
  ('성동옥수',   70),
  ('동대문제기', 80),
  ('강북미아',   90),
  ('노원중계',  100),
  ('중랑면목',  110),
  ('광진자양',  120)
ON CONFLICT (name) DO NOTHING;

-- RLS: 공개 read (anon이 /apply에서 읽음), write는 service_role만
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS branches_read_all ON branches;
CREATE POLICY branches_read_all ON branches
  FOR SELECT USING (true);
