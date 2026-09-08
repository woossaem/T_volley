-- =============================================================================
-- 게스트(temp_guest_N) 저장 허용 + 1:1 일괄 소급 연동 RPC
--
-- 스키마 점검 결과 (repo 마이그레이션 기준):
-- - matches.score_logs : jsonb 배열. player_id 컬럼/FK 없음 → 문자열 게스트 ID 저장 가능
-- - match_sets.host_lineup / away_lineup : jsonb. FK 없음
-- - set_lineups.player_id : text, users/profiles FK 없음
-- - match_events : 레포에 정의 없음. 원격에 uuid + users/profiles FK 가 있으면
--   temp_guest_x 저장이 실패하므로, 존재 시 FK 제거 및 text 로 완화한다.
-- =============================================================================

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT c.conname, t.relname AS tbl
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN unnest(c.conkey) WITH ORDINALITY AS cols(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = cols.attnum
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND t.relname IN ('match_events', 'set_lineups', 'lineups', 'score_logs')
      AND a.attname IN ('player_id', 'sub_out_id', 'playerId', 'subOutId')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', rec.tbl, rec.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'match_events'
      AND column_name = 'player_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.match_events
      ALTER COLUMN player_id TYPE text USING player_id::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'match_events'
      AND column_name = 'sub_out_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.match_events
      ALTER COLUMN sub_out_id TYPE text USING sub_out_id::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'set_lineups'
      AND column_name = 'player_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.set_lineups
      ALTER COLUMN player_id TYPE text USING player_id::text;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.replace_jsonb_guest_ids(data jsonb, mapping jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  key text;
  from_id text;
  to_id text;
  to_name text;
  item jsonb;
  out_arr jsonb := '[]'::jsonb;
  out_obj jsonb := '{}'::jsonb;
  pid text;
BEGIN
  IF data IS NULL THEN
    RETURN data;
  END IF;

  IF jsonb_typeof(data) = 'string' THEN
    FOR key IN SELECT jsonb_object_keys(mapping)
    LOOP
      IF data #>> '{}' = key THEN
        RETURN to_jsonb(mapping -> key ->> 'to_id');
      END IF;
    END LOOP;
    RETURN data;
  END IF;

  IF jsonb_typeof(data) = 'array' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(data)
    LOOP
      out_arr := out_arr || jsonb_build_array(public.replace_jsonb_guest_ids(item, mapping));
    END LOOP;
    RETURN out_arr;
  END IF;

  IF jsonb_typeof(data) <> 'object' THEN
    RETURN data;
  END IF;

  out_obj := data;
  pid := coalesce(data ->> 'player_id', data ->> 'playerId');
  IF pid IS NOT NULL AND mapping ? pid THEN
    to_id := mapping -> pid ->> 'to_id';
    to_name := mapping -> pid ->> 'to_name';
    IF data ? 'player_id' THEN
      out_obj := jsonb_set(out_obj, '{player_id}', to_jsonb(to_id), true);
    END IF;
    IF data ? 'playerId' THEN
      out_obj := jsonb_set(out_obj, '{playerId}', to_jsonb(to_id), true);
    END IF;
    IF to_name IS NOT NULL AND to_name <> '' THEN
      IF data ? 'player_name' THEN
        out_obj := jsonb_set(out_obj, '{player_name}', to_jsonb(to_name), true);
      END IF;
      IF data ? 'playerName' THEN
        out_obj := jsonb_set(out_obj, '{playerName}', to_jsonb(to_name), true);
      END IF;
      IF data ? 'name' THEN
        out_obj := jsonb_set(out_obj, '{name}', to_jsonb(to_name), true);
      END IF;
    END IF;
  END IF;

  IF out_obj ? 'sub_out_id' AND mapping ? (out_obj ->> 'sub_out_id') THEN
    from_id := out_obj ->> 'sub_out_id';
    out_obj := jsonb_set(out_obj, '{sub_out_id}', to_jsonb(mapping -> from_id ->> 'to_id'), true);
    IF mapping -> from_id ->> 'to_name' IS NOT NULL AND out_obj ? 'sub_out_name' THEN
      out_obj := jsonb_set(out_obj, '{sub_out_name}', to_jsonb(mapping -> from_id ->> 'to_name'), true);
    END IF;
  END IF;

  FOR key IN SELECT jsonb_object_keys(out_obj)
  LOOP
    IF key IN ('player_id', 'playerId', 'player_name', 'playerName', 'name', 'sub_out_id', 'sub_out_name') THEN
      CONTINUE;
    END IF;
    out_obj := jsonb_set(out_obj, ARRAY[key], public.replace_jsonb_guest_ids(out_obj -> key, mapping), true);
  END LOOP;

  RETURN out_obj;
END;
$$;

CREATE OR REPLACE FUNCTION public.bind_match_guest_players(
  p_match_id uuid,
  p_bindings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bind jsonb;
  mapping jsonb := '{}'::jsonb;
  from_id text;
  to_id text;
  to_name text;
  host_type text;
  away_type text;
BEGIN
  IF p_match_id IS NULL OR p_bindings IS NULL OR jsonb_typeof(p_bindings) <> 'array' THEN
    RAISE EXCEPTION 'bind_match_guest_players: match_id and bindings[] required';
  END IF;

  FOR bind IN SELECT value FROM jsonb_array_elements(p_bindings)
  LOOP
    from_id := bind ->> 'from_id';
    to_id := bind ->> 'to_id';
    to_name := bind ->> 'to_name';
    IF from_id IS NULL OR to_id IS NULL OR from_id = to_id THEN
      CONTINUE;
    END IF;
    IF from_id NOT LIKE 'temp_%' THEN
      CONTINUE;
    END IF;
    mapping := mapping || jsonb_build_object(from_id, jsonb_build_object('to_id', to_id, 'to_name', coalesce(to_name, '')));
  END LOOP;

  IF mapping = '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', true, 'updated', 0);
  END IF;

  FOR from_id IN SELECT jsonb_object_keys(mapping)
  LOOP
    to_id := mapping -> from_id ->> 'to_id';
    to_name := mapping -> from_id ->> 'to_name';

    IF to_regclass('public.match_events') IS NOT NULL THEN
      UPDATE public.match_events
      SET player_id = to_id,
          player_name = CASE WHEN to_name <> '' THEN to_name ELSE player_name END
      WHERE match_id = p_match_id AND player_id = from_id;

      BEGIN
        UPDATE public.match_events
        SET sub_out_id = to_id,
            sub_out_name = CASE WHEN to_name <> '' THEN to_name ELSE sub_out_name END
        WHERE match_id = p_match_id AND sub_out_id = from_id;
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
    END IF;

    IF to_regclass('public.set_lineups') IS NOT NULL THEN
      UPDATE public.set_lineups
      SET player_id = to_id, updated_at = now()
      WHERE match_id = p_match_id AND player_id = from_id;
    END IF;
  END LOOP;

  UPDATE public.matches
  SET score_logs = public.replace_jsonb_guest_ids(COALESCE(score_logs, '[]'::jsonb), mapping)
  WHERE id = p_match_id;

  SELECT data_type INTO host_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'host_roster';
  SELECT data_type INTO away_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'away_roster';

  IF host_type IN ('jsonb', 'json') THEN
    UPDATE public.matches
    SET host_roster = public.replace_jsonb_guest_ids(COALESCE(host_roster::jsonb, '{}'::jsonb), mapping)
    WHERE id = p_match_id;
  ELSIF host_type IS NOT NULL THEN
    UPDATE public.matches
    SET host_roster = public.replace_jsonb_guest_ids(COALESCE(host_roster::jsonb, '{}'::jsonb), mapping)::text
    WHERE id = p_match_id AND host_roster IS NOT NULL AND host_roster <> '';
  END IF;

  IF away_type IN ('jsonb', 'json') THEN
    UPDATE public.matches
    SET away_roster = public.replace_jsonb_guest_ids(COALESCE(away_roster::jsonb, '{}'::jsonb), mapping)
    WHERE id = p_match_id;
  ELSIF away_type IS NOT NULL THEN
    UPDATE public.matches
    SET away_roster = public.replace_jsonb_guest_ids(COALESCE(away_roster::jsonb, '{}'::jsonb), mapping)::text
    WHERE id = p_match_id AND away_roster IS NOT NULL AND away_roster <> '';
  END IF;

  IF to_regclass('public.match_sets') IS NOT NULL THEN
    UPDATE public.match_sets
    SET
      host_lineup = public.replace_jsonb_guest_ids(COALESCE(host_lineup, '[]'::jsonb), mapping),
      away_lineup = public.replace_jsonb_guest_ids(COALESCE(away_lineup, '[]'::jsonb), mapping),
      updated_at = now()
    WHERE match_id = p_match_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'updated', (SELECT count(*) FROM jsonb_object_keys(mapping) AS k));
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_jsonb_guest_ids(jsonb, jsonb) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bind_match_guest_players(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.bind_match_guest_players(uuid, jsonb) TO authenticated;
