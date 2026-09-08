-- =============================================================================
-- 웹 라이브 전광판: matches.short_code + anon SELECT
-- 기존 authenticated 권한/쓰기 정책은 변경하지 않는다.
-- =============================================================================

-- 1. matches 테이블에 6자리 단축 코드 컬럼 추가 (예: TV-A912)
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS short_code VARCHAR(10) UNIQUE;

-- 2. 비회원(anon) 웹 관전자를 위한 읽기(SELECT) 전용 RLS 정책 개방
DROP POLICY IF EXISTS "Allow anon read matches for live web" ON public.matches;
CREATE POLICY "Allow anon read matches for live web" ON public.matches FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read set_lineups for live web" ON public.set_lineups;
CREATE POLICY "Allow anon read set_lineups for live web" ON public.set_lineups FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow anon read teams for live web" ON public.teams;
CREATE POLICY "Allow anon read teams for live web" ON public.teams FOR SELECT TO anon USING (true);

-- score_logs 가 별도 테이블인 환경만 대상. 이 프로젝트에서는 matches.score_logs jsonb 컬럼이다.
DO $$
BEGIN
  IF to_regclass('public.score_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Allow anon read score_logs for live web" ON public.score_logs;
    CREATE POLICY "Allow anon read score_logs for live web" ON public.score_logs FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- 라이브 전광판이 읽는 세트/이벤트 테이블 (테이블이 있을 때만)
DO $$
BEGIN
  IF to_regclass('public.match_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Allow anon read match_events for live web" ON public.match_events;
    CREATE POLICY "Allow anon read match_events for live web" ON public.match_events FOR SELECT TO anon USING (true);
  END IF;
  IF to_regclass('public.match_sets') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Allow anon read match_sets for live web" ON public.match_sets;
    CREATE POLICY "Allow anon read match_sets for live web" ON public.match_sets FOR SELECT TO anon USING (true);
  END IF;
END $$;
