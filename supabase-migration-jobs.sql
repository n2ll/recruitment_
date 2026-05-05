-- 구인 공고(jobs) + 공고-후보 매칭(job_candidates) 테이블
-- 구인 에이전트 탭의 핵심 데이터 모델. 한 공고 = 영속 객체이며,
-- 공고에 묶인 후보들의 단계별(screening/onboarding/active) 진행을 job_candidates가 추적한다.
--
-- 정책:
--   - 한 사람은 동시에 하나의 active job_candidate만 가진다 (current_job_id 헬퍼)
--   - messages.job_id로 메시지를 공고에 연결 (대화 컨텍스트 분리)
--   - applicants.agent_stage/agent_state는 추가하지 않음 (job_candidates에서 관리)


-- ─────────────────────────────────────────────────────────────
-- 1. jobs 테이블
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id                BIGSERIAL PRIMARY KEY,
  title             TEXT NOT NULL,                -- "강북미아 평일오전 자차 5/12 시작" (Claude 자동 생성)
  body              TEXT NOT NULL,                -- 공고 전문 (SMS로 발송될 텍스트)
  branch            TEXT,                         -- 매칭 지점 (branches.name)
  slot              TEXT,                         -- 평일오전/평일오후/주말오전/주말오후
  start_date        DATE,
  vehicle_required  BOOLEAN NOT NULL DEFAULT TRUE,
  pickup_address    TEXT,
  pickup_lat        NUMERIC,
  pickup_lng        NUMERIC,
  capacity          INT NOT NULL DEFAULT 1,       -- 모집 인원
  status            TEXT NOT NULL DEFAULT 'active',  -- active/closed/paused
  created_by        TEXT,                         -- 매니저 식별자 (선택)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at         TIMESTAMPTZ,
  CONSTRAINT chk_jobs_status CHECK (status IN ('active', 'closed', 'paused')),
  CONSTRAINT chk_jobs_slot CHECK (
    slot IS NULL OR slot IN ('평일오전', '평일오후', '주말오전', '주말오후')
  ),
  CONSTRAINT chk_jobs_capacity CHECK (capacity >= 1)
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_created
  ON jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_branch_slot
  ON jobs (branch, slot)
  WHERE status = 'active';

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION trg_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_set_updated_at ON jobs;
CREATE TRIGGER jobs_set_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION trg_jobs_updated_at();


-- ─────────────────────────────────────────────────────────────
-- 2. job_candidates 테이블 (공고 ↔ 지원자 매칭 + agent 진행 상태)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_candidates (
  id              BIGSERIAL PRIMARY KEY,
  job_id          BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_id    BIGINT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  agent_stage     TEXT,                           -- NULL=발송만 됨, screening/onboarding/active/paused/abort
  agent_state     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 체크리스트, 메타
  paused_reason   TEXT,                           -- agent_stage='paused'일 때 사유
  sent_at         TIMESTAMPTZ,                    -- 공고 발송 시각
  responded_at    TIMESTAMPTZ,                    -- 첫 응답 시각
  confirmed_at    TIMESTAMPTZ,                    -- screening → onboarding 전이 시점
  activated_at    TIMESTAMPTZ,                    -- onboarding → active 전이 시점 (근무 시작)
  closed_at       TIMESTAMPTZ,                    -- 종료 시각
  closed_reason   TEXT,                           -- completed/abort/churn/duplicate/manual
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, applicant_id),
  CONSTRAINT chk_jc_stage CHECK (
    agent_stage IS NULL OR agent_stage IN ('screening', 'onboarding', 'active', 'paused', 'abort')
  )
);

CREATE INDEX IF NOT EXISTS idx_jc_job_stage
  ON job_candidates (job_id, agent_stage);
CREATE INDEX IF NOT EXISTS idx_jc_applicant
  ON job_candidates (applicant_id, created_at DESC);
-- 사람별 active 후보(=진행 중)만 빠르게 조회 (한 사람 = 하나만 active 보장 헬퍼)
CREATE INDEX IF NOT EXISTS idx_jc_applicant_active
  ON job_candidates (applicant_id)
  WHERE agent_stage IS NOT NULL AND agent_stage NOT IN ('abort');

DROP TRIGGER IF EXISTS jc_set_updated_at ON job_candidates;
CREATE TRIGGER jc_set_updated_at
  BEFORE UPDATE ON job_candidates
  FOR EACH ROW EXECUTE FUNCTION trg_jobs_updated_at();


-- ─────────────────────────────────────────────────────────────
-- 3. applicants.current_job_id  (현재 진행 중인 공고 헬퍼)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS current_job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_applicants_current_job
  ON applicants (current_job_id)
  WHERE current_job_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- 4. messages.job_id  (메시지 ↔ 공고 연결 — 대화 컨텍스트 분리)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_job_created
  ON messages (job_id, created_at)
  WHERE job_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- 5. RLS — admin/service_role만 접근 (anon 차단)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jobs_service_all ON jobs;
CREATE POLICY jobs_service_all ON jobs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE job_candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jc_service_all ON job_candidates;
CREATE POLICY jc_service_all ON job_candidates FOR ALL USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────
-- 6. Realtime publication (admin UI 실시간 보드 갱신용)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'job_candidates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE job_candidates;
  END IF;
END $$;
