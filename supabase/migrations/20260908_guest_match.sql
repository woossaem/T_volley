-- =============================================================================
-- 미가입 게스트 팀 경기 (is_guest_match)
-- 랭킹 유예 후 상대 팀 소급 연동 시 false 로 전환
-- =============================================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS is_guest_match boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS matches_is_guest_match_idx
  ON public.matches (is_guest_match)
  WHERE is_guest_match = true;
