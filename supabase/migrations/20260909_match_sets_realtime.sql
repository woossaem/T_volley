-- 웹 전광판이 match_sets.host_score / away_score UPDATE 를 실시간으로 받도록 한다.
DO $$
BEGIN
  IF to_regclass('public.match_sets') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.match_sets REPLICA IDENTITY FULL;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.match_sets;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;

  IF to_regclass('public.match_events') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.match_events REPLICA IDENTITY FULL;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.match_events;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
