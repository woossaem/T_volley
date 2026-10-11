-- 음성 기록의 표준 액션(SERVE_FAULT 등)을 실시간 타임라인이 구분할 수 있게 한다.
-- 컬럼이 없어도 score_logs JSON 의 action_code 로 같은 값을 읽는다.

ALTER TABLE public.match_events
  ADD COLUMN IF NOT EXISTS action_code text;
