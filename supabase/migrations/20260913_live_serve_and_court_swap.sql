-- 라이브 전광판: 기록자 코트 방향 + 세트별 첫 서브 설정
-- match_sets / match_events 타임라인·라인업 로직은 변경하지 않는다.
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS is_swapped boolean NOT NULL DEFAULT false;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS serve_setup jsonb NOT NULL DEFAULT '{}'::jsonb;
