-- =============================================================================
-- 세트별 스코어/라인업 SSOT (match_sets)
--
-- matches.set_scores / host_roster / away_roster 는 조회용 캐시로 유지하고,
-- 스코어보드 ↔ 빠른 결과 입력 동기화의 정본은 match_sets 를 쓴다.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.match_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  set_number int NOT NULL CHECK (set_number >= 1),
  host_score int NOT NULL DEFAULT 0,
  away_score int NOT NULL DEFAULT 0,
  host_lineup jsonb NOT NULL DEFAULT '[]'::jsonb,
  away_lineup jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_closed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, set_number)
);

CREATE INDEX IF NOT EXISTS match_sets_match_id_idx ON public.match_sets (match_id);

ALTER TABLE public.match_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS match_sets_select ON public.match_sets;
CREATE POLICY match_sets_select ON public.match_sets
  FOR SELECT USING (true);

DROP POLICY IF EXISTS match_sets_insert ON public.match_sets;
CREATE POLICY match_sets_insert ON public.match_sets
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS match_sets_update ON public.match_sets;
CREATE POLICY match_sets_update ON public.match_sets
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS match_sets_delete ON public.match_sets;
CREATE POLICY match_sets_delete ON public.match_sets
  FOR DELETE USING (true);
