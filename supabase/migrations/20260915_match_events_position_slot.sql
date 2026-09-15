-- 득점/범실/교체를 포지션 슬롯(1~n) 기준으로 추적한다.
-- 컬럼이 아직 없어도 score_logs JSON 에도 동일 키를 넣어 하위 호환한다.

ALTER TABLE public.match_events
  ADD COLUMN IF NOT EXISTS position_slot int;

CREATE INDEX IF NOT EXISTS match_events_match_slot_idx
  ON public.match_events (match_id, position_slot);
