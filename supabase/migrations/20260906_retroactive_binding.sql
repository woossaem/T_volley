-- =============================================================================
-- 미가입 선수/팀 소급 연동 (Retroactive Binding)
-- =============================================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT true;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS host_team_id uuid;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS away_team_id uuid;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS score_logs jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS retro_claim_status text;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS retro_claim_team_id uuid;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS retro_claim_team_name text;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS retro_claim_user_id uuid;

UPDATE public.matches
SET is_official = false
WHERE status = 'friendly' AND is_official IS DISTINCT FROM false;

CREATE TABLE IF NOT EXISTS public.set_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  set_number int NOT NULL CHECK (set_number >= 1),
  side text NOT NULL CHECK (side IN ('host', 'away')),
  slot_index int NOT NULL DEFAULT 0,
  player_id text,
  position text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, set_number, side, slot_index)
);

CREATE INDEX IF NOT EXISTS set_lineups_match_id_idx ON public.set_lineups (match_id);
CREATE INDEX IF NOT EXISTS set_lineups_player_id_idx ON public.set_lineups (player_id);

ALTER TABLE public.set_lineups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS set_lineups_select ON public.set_lineups;
CREATE POLICY set_lineups_select ON public.set_lineups
  FOR SELECT USING (true);

DROP POLICY IF EXISTS set_lineups_insert ON public.set_lineups;
CREATE POLICY set_lineups_insert ON public.set_lineups
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS set_lineups_update ON public.set_lineups;
CREATE POLICY set_lineups_update ON public.set_lineups
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS set_lineups_delete ON public.set_lineups;
CREATE POLICY set_lineups_delete ON public.set_lineups
  FOR DELETE USING (true);
