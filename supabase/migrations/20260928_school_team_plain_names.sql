-- 학교 팀 이름을 "삼은초", "온양동신초"처럼 학교명만 남긴다.
-- 이미 적용된 v2.2.1 함수가 "학교명 배구단"을 만들므로, 데이터와 함수를 함께 고친다.

UPDATE public.matches
SET host_team_name = regexp_replace(btrim(host_team_name), '\s*배구단$', '')
WHERE host_team_name ~ '\s*배구단$';

UPDATE public.matches
SET away_team_name = regexp_replace(btrim(away_team_name), '\s*배구단$', '')
WHERE away_team_name ~ '\s*배구단$';

UPDATE public.teams AS t
SET name = regexp_replace(btrim(t.name), '\s*배구단$', '')
WHERE t.team_type IN ('school', '학교')
  AND btrim(coalesce(t.name, '')) ~ '\s*배구단$'
  AND NOT EXISTS (
    SELECT 1
    FROM public.teams AS other
    WHERE other.id <> t.id
      AND other.team_type IN ('school', '학교')
      AND other.region IS NOT DISTINCT FROM t.region
      AND other.name = regexp_replace(btrim(t.name), '\s*배구단$', '')
  );

-- 같은 지역에 "학교명"과 "학교명 배구단"이 둘 다 있으면 학교명 팀으로 팀원을 모은다.
DO $$
DECLARE
  suffix record;
  plain_id uuid;
BEGIN
  FOR suffix IN
    SELECT id, name, region
    FROM public.teams
    WHERE team_type IN ('school', '학교')
      AND btrim(name) ~ '\s*배구단$'
  LOOP
    SELECT id INTO plain_id
    FROM public.teams
    WHERE id <> suffix.id
      AND team_type IN ('school', '학교')
      AND region IS NOT DISTINCT FROM suffix.region
      AND name = regexp_replace(btrim(suffix.name), '\s*배구단$', '')
    LIMIT 1;

    IF plain_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.team_members (user_id, team_id, is_active, is_primary)
    SELECT m.user_id, plain_id, coalesce(m.is_active, true), coalesce(m.is_primary, false)
    FROM public.team_members AS m
    WHERE m.team_id = suffix.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.team_members AS existing
        WHERE existing.user_id = m.user_id
          AND existing.team_id = plain_id
      );

    DELETE FROM public.team_members WHERE team_id = suffix.id;

    BEGIN
      DELETE FROM public.teams WHERE id = suffix.id;
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE NOTICE '학교 팀 % 은 연결된 기록이 있어 이름을 합치지 못했습니다.', suffix.name;
    END;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_school_team_membership(
  p_school_name text,
  p_school_region text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_name text := regexp_replace(btrim(coalesce(p_school_name, '')), '초등학교$', '초');
  v_region text := public.canonicalize_admin_region(p_school_region);
  v_team_id uuid;
  v_team_name text;
  v_created boolean := false;
  v_attempt int := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF length(v_name) < 2 THEN
    RAISE EXCEPTION '학교명을 2자 이상 입력해 주세요.';
  END IF;
  IF v_region IS NULL THEN
    RAISE EXCEPTION '학교 행정구역을 확인해 주세요. 예: 충남 아산시';
  END IF;

  UPDATE public.profiles
  SET
    school_name = v_name,
    school_region = v_region,
    updated_at = now()
  WHERE id = uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION '프로필을 찾을 수 없습니다.';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;

    SELECT t.id, t.name
    INTO v_team_id, v_team_name
    FROM public.teams AS t
    WHERE t.team_type IN ('school', '학교')
      AND public.school_names_match(t.name, v_name)
      AND public.admin_regions_compatible(t.region, v_region)
    ORDER BY (t.name = v_name) DESC, (t.region = v_region) DESC, t.id
    LIMIT 1;

    EXIT WHEN v_team_id IS NOT NULL;

    BEGIN
      INSERT INTO public.teams (name, region, team_type, leader_id, status, is_public)
      VALUES (v_name, v_region, 'school', uid, 'active', true)
      RETURNING id, name INTO v_team_id, v_team_name;
      v_created := true;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 3 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  IF v_team_name ~ '\s*배구단$' AND v_team_name IS DISTINCT FROM v_name THEN
    UPDATE public.teams
    SET name = v_name
    WHERE id = v_team_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.teams AS other
        WHERE other.id <> v_team_id
          AND other.team_type IN ('school', '학교')
          AND other.region IS NOT DISTINCT FROM v_region
          AND other.name = v_name
      );
    IF FOUND THEN
      v_team_name := v_name;
    END IF;
  END IF;

  UPDATE public.teams AS t
  SET region = v_region
  WHERE t.id = v_team_id
    AND t.region IS DISTINCT FROM v_region
    AND NOT EXISTS (
      SELECT 1
      FROM public.teams AS other
      WHERE other.id <> t.id
        AND other.team_type IN ('school', '학교')
        AND other.name = t.name
        AND other.region = v_region
    );

  IF EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = uid AND team_id = v_team_id
  ) THEN
    UPDATE public.team_members
    SET is_active = true
    WHERE user_id = uid
      AND team_id = v_team_id
      AND is_active IS FALSE;
  ELSE
    INSERT INTO public.team_members (user_id, team_id, is_active, is_primary)
    VALUES (
      uid,
      v_team_id,
      true,
      NOT EXISTS (
        SELECT 1
        FROM public.team_members
        WHERE user_id = uid
          AND is_active IS NOT FALSE
          AND coalesce(is_primary, false) = true
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'team_id', v_team_id,
    'team_name', v_team_name,
    'region', v_region,
    'created', v_created
  );
END;
$$;
