-- 학교 팀은 자동 가입만으로 팀 대표가 되지 않는다.
-- 동호회(club) 팀의 leader_id 는 건드리지 않는다.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS role text;

UPDATE public.team_members
SET role = 'member'
WHERE role IS NULL
   OR btrim(role) = '';

ALTER TABLE public.team_members
  ALTER COLUMN role SET DEFAULT 'member';

UPDATE public.team_members
SET role = 'member'
WHERE role NOT IN ('member', 'leader');

ALTER TABLE public.team_members
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS team_members_role_check;

ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('member', 'leader'));

-- 자동 개설로 붙었던 학교 팀 대표만 공석으로 되돌린다.
UPDATE public.teams
SET leader_id = NULL
WHERE team_type IN ('school', '학교')
  AND leader_id IS NOT NULL;

UPDATE public.team_members AS member
SET role = 'member'
FROM public.teams AS team
WHERE member.team_id = team.id
  AND team.team_type IN ('school', '학교')
  AND member.role IS DISTINCT FROM 'member';

-- 동호회 팀에서 이미 지정된 대표의 role 만 맞춘다.
UPDATE public.team_members AS member
SET role = 'leader'
FROM public.teams AS team
WHERE member.team_id = team.id
  AND team.team_type NOT IN ('school', '학교')
  AND team.leader_id = member.user_id
  AND member.role IS DISTINCT FROM 'leader';

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
      VALUES (v_name, v_region, 'school', NULL, 'active', true)
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
    SET is_active = true,
        role = coalesce(NULLIF(role, ''), 'member')
    WHERE user_id = uid
      AND team_id = v_team_id
      AND is_active IS FALSE;
  ELSE
    INSERT INTO public.team_members (user_id, team_id, is_active, is_primary, role)
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
      ),
      'member'
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

REVOKE ALL ON FUNCTION public.ensure_school_team_membership(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_school_team_membership(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_school_team_membership(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_vacant_team_leadership(p_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_leader uuid;
  v_name text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  SELECT leader_id, name
  INTO v_leader, v_name
  FROM public.teams
  WHERE id = p_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '팀을 찾을 수 없습니다.';
  END IF;

  IF v_leader IS NOT NULL THEN
    RAISE EXCEPTION '이미 팀 대표가 있습니다.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.team_members
    WHERE team_id = p_team_id
      AND user_id = uid
      AND is_active IS NOT FALSE
  ) THEN
    RAISE EXCEPTION '소속 팀원만 대표로 등록할 수 있습니다.';
  END IF;

  UPDATE public.team_members
  SET role = 'member'
  WHERE team_id = p_team_id
    AND user_id <> uid
    AND role = 'leader';

  UPDATE public.team_members
  SET role = 'leader'
  WHERE team_id = p_team_id
    AND user_id = uid;

  UPDATE public.teams
  SET leader_id = uid
  WHERE id = p_team_id
    AND leader_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION '이미 팀 대표가 있습니다.';
  END IF;

  RETURN jsonb_build_object(
    'team_id', p_team_id,
    'leader_id', uid,
    'team_name', v_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_vacant_team_leadership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_vacant_team_leadership(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_vacant_team_leadership(uuid) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'teams'
      AND c.relrowsecurity
  ) THEN
    DROP POLICY IF EXISTS teams_insert_school_team_as_leader ON public.teams;
    DROP POLICY IF EXISTS teams_insert_school_team_vacant ON public.teams;
    CREATE POLICY teams_insert_school_team_vacant ON public.teams
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND team_type IN ('school', '학교')
        AND leader_id IS NULL
        AND coalesce(is_public, true) = true
      );
  END IF;
END $$;
