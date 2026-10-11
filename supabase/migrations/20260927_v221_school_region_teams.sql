-- =============================================================================
-- v2.2.1 학교 행정구역 태깅, 학교 팀 자동 생성/가입, 기존 회원 소급 배치
--
-- 적용 방법 (둘 중 하나):
-- 1) Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여 넣고 Run
-- 2) 로컬 CLI: supabase db push
--
-- 앱의 팀 종류 컬럼은 type 이 아니라 team_type 이다.
-- 학교 팀만 (name, region) 부분 유니크 인덱스로 막고, 동호회 팀은 대상에서 뺀다.
-- =============================================================================

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS region text;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school_region text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_name_public boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_stats_public boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nickname character varying(8);

COMMENT ON COLUMN public.teams.region IS '팀 행정구역. 학교 팀은 학교 소재지. 예: 충남 아산시, 서울 강남구';
COMMENT ON COLUMN public.teams.is_public IS '팀 기록 공개 여부. 기본 공개';
COMMENT ON COLUMN public.profiles.school_region IS '소속 학교의 실제 행정구역 소재지';
COMMENT ON COLUMN public.profiles.is_name_public IS '실명 공개 여부. 기본 비공개';
COMMENT ON COLUMN public.profiles.is_stats_public IS '개인 기록 공개 여부. 기본 공개';
COMMENT ON COLUMN public.profiles.nickname IS '닉네임. 최대 8자';

CREATE INDEX IF NOT EXISTS profiles_school_region_idx
  ON public.profiles (school_region);

CREATE INDEX IF NOT EXISTS teams_school_lookup_idx
  ON public.teams (team_type, region, name);

-- -----------------------------------------------------------------------------
-- 행정구역 표준화. 라벨은 constants/adminRegionData.json 과 같다.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.canonicalize_admin_region(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  original text := btrim(regexp_replace(coalesce(raw, ''), '\s+', ' ', 'g'));
  text_in text;
  labels text[] := ARRAY[
    '서울 강남구',
    '서울 강동구',
    '서울 강북구',
    '서울 강서구',
    '서울 관악구',
    '서울 광진구',
    '서울 구로구',
    '서울 금천구',
    '서울 노원구',
    '서울 도봉구',
    '서울 동대문구',
    '서울 동작구',
    '서울 마포구',
    '서울 서대문구',
    '서울 서초구',
    '서울 성동구',
    '서울 성북구',
    '서울 송파구',
    '서울 양천구',
    '서울 영등포구',
    '서울 용산구',
    '서울 은평구',
    '서울 종로구',
    '서울 중구',
    '서울 중랑구',
    '부산 강서구',
    '부산 금정구',
    '부산 기장군',
    '부산 남구',
    '부산 동구',
    '부산 동래구',
    '부산 부산진구',
    '부산 북구',
    '부산 사상구',
    '부산 사하구',
    '부산 서구',
    '부산 수영구',
    '부산 연제구',
    '부산 영도구',
    '부산 중구',
    '부산 해운대구',
    '대구 군위군',
    '대구 남구',
    '대구 달서구',
    '대구 달성군',
    '대구 동구',
    '대구 북구',
    '대구 서구',
    '대구 수성구',
    '대구 중구',
    '인천 강화군',
    '인천 계양구',
    '인천 남동구',
    '인천 동구',
    '인천 미추홀구',
    '인천 부평구',
    '인천 서구',
    '인천 연수구',
    '인천 옹진군',
    '인천 중구',
    '광주 광산구',
    '광주 남구',
    '광주 동구',
    '광주 북구',
    '광주 서구',
    '대전 대덕구',
    '대전 동구',
    '대전 서구',
    '대전 유성구',
    '대전 중구',
    '울산 남구',
    '울산 동구',
    '울산 북구',
    '울산 울주군',
    '울산 중구',
    '세종시',
    '경기 가평군',
    '경기 고양시',
    '경기 과천시',
    '경기 광명시',
    '경기 광주시',
    '경기 구리시',
    '경기 군포시',
    '경기 김포시',
    '경기 남양주시',
    '경기 동두천시',
    '경기 부천시',
    '경기 성남시',
    '경기 수원시',
    '경기 시흥시',
    '경기 안산시',
    '경기 안성시',
    '경기 안양시',
    '경기 양주시',
    '경기 양평군',
    '경기 여주시',
    '경기 연천군',
    '경기 오산시',
    '경기 용인시',
    '경기 의왕시',
    '경기 의정부시',
    '경기 이천시',
    '경기 파주시',
    '경기 평택시',
    '경기 포천시',
    '경기 하남시',
    '경기 화성시',
    '강원 강릉시',
    '강원 고성군',
    '강원 동해시',
    '강원 삼척시',
    '강원 속초시',
    '강원 양구군',
    '강원 양양군',
    '강원 영월군',
    '강원 원주시',
    '강원 인제군',
    '강원 정선군',
    '강원 철원군',
    '강원 춘천시',
    '강원 태백시',
    '강원 평창군',
    '강원 홍천군',
    '강원 화천군',
    '강원 횡성군',
    '충북 괴산군',
    '충북 단양군',
    '충북 보은군',
    '충북 영동군',
    '충북 옥천군',
    '충북 음성군',
    '충북 제천시',
    '충북 증평군',
    '충북 진천군',
    '충북 청주시',
    '충북 충주시',
    '충남 계룡시',
    '충남 공주시',
    '충남 금산군',
    '충남 논산시',
    '충남 당진시',
    '충남 보령시',
    '충남 부여군',
    '충남 서산시',
    '충남 서천군',
    '충남 아산시',
    '충남 예산군',
    '충남 천안시',
    '충남 청양군',
    '충남 태안군',
    '충남 홍성군',
    '전북 고창군',
    '전북 군산시',
    '전북 김제시',
    '전북 남원시',
    '전북 무주군',
    '전북 부안군',
    '전북 순창군',
    '전북 완주군',
    '전북 익산시',
    '전북 임실군',
    '전북 장수군',
    '전북 전주시',
    '전북 정읍시',
    '전북 진안군',
    '전남 강진군',
    '전남 고흥군',
    '전남 곡성군',
    '전남 광양시',
    '전남 구례군',
    '전남 나주시',
    '전남 담양군',
    '전남 목포시',
    '전남 무안군',
    '전남 보성군',
    '전남 순천시',
    '전남 신안군',
    '전남 여수시',
    '전남 영광군',
    '전남 영암군',
    '전남 완도군',
    '전남 장성군',
    '전남 장흥군',
    '전남 진도군',
    '전남 함평군',
    '전남 해남군',
    '전남 화순군',
    '경북 경산시',
    '경북 경주시',
    '경북 고령군',
    '경북 구미시',
    '경북 김천시',
    '경북 문경시',
    '경북 봉화군',
    '경북 상주시',
    '경북 성주군',
    '경북 안동시',
    '경북 영덕군',
    '경북 영양군',
    '경북 영주시',
    '경북 영천시',
    '경북 예천군',
    '경북 울릉군',
    '경북 울진군',
    '경북 의성군',
    '경북 청도군',
    '경북 청송군',
    '경북 칠곡군',
    '경북 포항시',
    '경남 거제시',
    '경남 거창군',
    '경남 고성군',
    '경남 김해시',
    '경남 남해군',
    '경남 밀양시',
    '경남 사천시',
    '경남 산청군',
    '경남 양산시',
    '경남 의령군',
    '경남 진주시',
    '경남 창녕군',
    '경남 창원시',
    '경남 통영시',
    '경남 하동군',
    '경남 함안군',
    '경남 함양군',
    '경남 합천군',
    '제주 서귀포시',
    '제주 제주시'
  ];
  sido text;
  rest text;
  stem text;
  candidate text;
  district text;
  matches int := 0;
  found text := NULL;
BEGIN
  IF original = '' THEN
    RETURN NULL;
  END IF;
  IF original = ANY(labels) THEN
    RETURN original;
  END IF;
  IF original IN ('세종', '세종특별자치시') THEN
    RETURN '세종시';
  END IF;

  text_in := original;
  text_in := replace(text_in, '서울특별시', '서울');
  text_in := replace(text_in, '부산광역시', '부산');
  text_in := replace(text_in, '대구광역시', '대구');
  text_in := replace(text_in, '인천광역시', '인천');
  text_in := replace(text_in, '광주광역시', '광주');
  text_in := replace(text_in, '대전광역시', '대전');
  text_in := replace(text_in, '울산광역시', '울산');
  text_in := replace(text_in, '세종특별자치시', '세종');
  text_in := replace(text_in, '제주특별자치도', '제주');
  text_in := replace(text_in, '강원특별자치도', '강원');
  text_in := replace(text_in, '전북특별자치도', '전북');
  text_in := replace(text_in, '충청남도', '충남');
  text_in := replace(text_in, '충청북도', '충북');
  text_in := replace(text_in, '전라남도', '전남');
  text_in := replace(text_in, '전라북도', '전북');
  text_in := replace(text_in, '경상남도', '경남');
  text_in := replace(text_in, '경상북도', '경북');
  text_in := replace(text_in, '경기도', '경기');
  text_in := replace(text_in, '제주도', '제주');
  text_in := replace(text_in, '강원도', '강원');
  text_in := btrim(regexp_replace(text_in, '\s+', ' ', 'g'));

  IF text_in = ANY(labels) THEN
    RETURN text_in;
  END IF;
  IF text_in = '세종' THEN
    RETURN '세종시';
  END IF;

  sido := split_part(text_in, ' ', 1);
  rest := btrim(substr(text_in, length(sido) + 1));
  rest := regexp_replace(rest, '\s+', '', 'g');

  IF rest <> '' AND sido IN (
    '서울','부산','대구','인천','광주','대전','울산','세종',
    '경기','강원','충북','충남','전북','전남','경북','경남','제주'
  ) THEN
    FOREACH candidate IN ARRAY labels LOOP
      district := CASE WHEN candidate = '세종시' THEN '세종시' ELSE split_part(candidate, ' ', 2) END;
      IF split_part(candidate, ' ', 1) = sido OR candidate = '세종시' THEN
        IF candidate = sido || ' ' || rest
           OR district = rest
           OR regexp_replace(district, '(시|군|구)$', '') = regexp_replace(rest, '(시|군|구)$', '')
        THEN
          IF found IS DISTINCT FROM candidate THEN
            matches := matches + 1;
            found := candidate;
          END IF;
        END IF;
      END IF;
    END LOOP;
    IF matches = 1 THEN
      RETURN found;
    END IF;
    RETURN NULL;
  END IF;

  stem := regexp_replace(text_in, '(시|군|구)$', '');
  IF length(stem) < 2 OR stem IN (
    '서울','부산','대구','인천','광주','대전','울산','세종',
    '경기','강원','충북','충남','전북','전남','경북','경남','제주'
  ) THEN
    RETURN NULL;
  END IF;

  matches := 0;
  found := NULL;
  FOREACH candidate IN ARRAY labels LOOP
    district := CASE WHEN candidate = '세종시' THEN '세종시' ELSE split_part(candidate, ' ', 2) END;
    IF district = text_in OR regexp_replace(district, '(시|군|구)$', '') = stem THEN
      matches := matches + 1;
      found := candidate;
    END IF;
  END LOOP;
  IF matches = 1 THEN
    RETURN found;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.school_names_match(left_name text, right_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  WITH norm AS (
    SELECT
      regexp_replace(btrim(coalesce(left_name, '')), '\s*배구단$', '') AS l0,
      regexp_replace(btrim(coalesce(right_name, '')), '\s*배구단$', '') AS r0
  ),
  short AS (
    SELECT
      regexp_replace(l0, '초등학교$', '초') AS l,
      regexp_replace(r0, '초등학교$', '초') AS r
    FROM norm
  )
  SELECT l <> '' AND l = r FROM short;
$$;

CREATE OR REPLACE FUNCTION public.admin_regions_compatible(stored text, canonical text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  target text := public.canonicalize_admin_region(canonical);
  normalized_stored text := public.canonicalize_admin_region(stored);
  district text;
  stem text;
  compact_stored text;
BEGIN
  IF target IS NULL THEN
    target := btrim(coalesce(canonical, ''));
  END IF;
  IF target = '' THEN
    RETURN false;
  END IF;
  IF normalized_stored IS NOT NULL AND normalized_stored = target THEN
    RETURN true;
  END IF;
  IF btrim(coalesce(stored, '')) = target THEN
    RETURN true;
  END IF;

  district := CASE WHEN target = '세종시' THEN '세종시' ELSE btrim(split_part(target, ' ', 2)) END;
  stem := regexp_replace(district, '(시|군|구)$', '');
  IF length(stem) < 2 THEN
    RETURN false;
  END IF;
  IF btrim(coalesce(stored, '')) IN (stem, district) THEN
    RETURN true;
  END IF;

  compact_stored := regexp_replace(btrim(coalesce(stored, '')), '\s+', '', 'g');
  IF compact_stored IN (
    regexp_replace(target, '\s+', '', 'g'),
    split_part(target, ' ', 1) || stem,
    split_part(target, ' ', 1) || district
  ) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

-- 초등학교 접미사는 기존 화면과 같이 "초"로 맞춘다.
UPDATE public.profiles
SET school_name = regexp_replace(btrim(school_name), '초등학교$', '초')
WHERE btrim(coalesce(school_name, '')) <> ''
  AND school_name ~ '초등학교$';

-- 학교명이 있는 기존 회원에게 행정구역을 채운다.
-- 우선순위: official_schools → 주 활동 지역 첫 토큰 → 아산/천안 키워드 → 충남 천안시
UPDATE public.profiles AS p
SET
  school_region = sub.detected,
  updated_at = now()
FROM (
  SELECT
    p2.id,
    COALESCE(
      (
        SELECT public.canonicalize_admin_region(s.region)
        FROM public.official_schools AS s
        WHERE COALESCE(s.is_active, true) = true
          AND public.school_names_match(s.name, p2.school_name)
          AND public.canonicalize_admin_region(s.region) IS NOT NULL
        ORDER BY
          CASE
            WHEN coalesce(p2.region, '') ~ '아산' AND coalesce(s.region, '') ~ '아산' THEN 0
            WHEN coalesce(p2.region, '') ~ '천안' AND coalesce(s.region, '') ~ '천안' THEN 1
            ELSE 2
          END,
          s.name
        LIMIT 1
      ),
      public.canonicalize_admin_region(btrim(split_part(coalesce(p2.region, ''), ',', 1))),
      CASE
        WHEN btrim(split_part(coalesce(p2.region, ''), ',', 1)) ~ '아산' THEN '충남 아산시'
        WHEN btrim(split_part(coalesce(p2.region, ''), ',', 1)) ~ '천안' THEN '충남 천안시'
        WHEN coalesce(p2.region, '') ~ '아산' AND coalesce(p2.region, '') !~ '천안' THEN '충남 아산시'
        WHEN coalesce(p2.region, '') ~ '천안' THEN '충남 천안시'
        ELSE '충남 천안시'
      END
    ) AS detected
  FROM public.profiles AS p2
  WHERE btrim(coalesce(p2.school_name, '')) <> ''
    AND btrim(coalesce(p2.school_region, '')) = ''
) AS sub
WHERE p.id = sub.id
  AND sub.detected IS NOT NULL;

-- 같은 이름·같은 행정구역 학교 팀이 이미 여러 줄이면 멤버를 한 팀으로 모은 뒤 나머지를 지운다.
DO $$
DECLARE
  grp record;
  keeper uuid;
  dup uuid;
BEGIN
  FOR grp IN
    SELECT name, region
    FROM public.teams
    WHERE team_type IN ('school', '학교')
      AND region IS NOT NULL
      AND btrim(region) <> ''
    GROUP BY name, region
    HAVING count(*) > 1
  LOOP
    SELECT id INTO keeper
    FROM public.teams
    WHERE name = grp.name
      AND region = grp.region
      AND team_type IN ('school', '학교')
    ORDER BY id
    LIMIT 1;

    FOR dup IN
      SELECT id
      FROM public.teams
      WHERE name = grp.name
        AND region = grp.region
        AND team_type IN ('school', '학교')
        AND id <> keeper
    LOOP
      UPDATE public.team_members AS incoming
      SET team_id = keeper
      WHERE incoming.team_id = dup
        AND NOT EXISTS (
          SELECT 1
          FROM public.team_members AS existing
          WHERE existing.user_id = incoming.user_id
            AND existing.team_id = keeper
        );

      DELETE FROM public.team_members
      WHERE team_id = dup;

      BEGIN
        DELETE FROM public.teams WHERE id = dup;
      EXCEPTION WHEN foreign_key_violation THEN
        RAISE EXCEPTION
          '학교 팀 중복을 합치지 못했습니다. name=%, region=%, id=%',
          grp.name, grp.region, dup;
      END;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS teams_school_name_region_uidx
  ON public.teams (name, region)
  WHERE team_type IN ('school', '학교')
    AND region IS NOT NULL
    AND btrim(region) <> '';

-- (학교명, 행정구역) 학교 팀이 없으면 "학교명 배구단"을 만든다.
INSERT INTO public.teams (name, region, team_type, leader_id, status, is_public)
SELECT
  grouped.school_name_short || ' 배구단',
  grouped.school_region,
  'school',
  grouped.leader_id,
  'active',
  true
FROM (
  SELECT
    regexp_replace(btrim(p.school_name), '초등학교$', '초') AS school_name_short,
    p.school_region,
    (array_agg(p.id ORDER BY p.id))[1] AS leader_id
  FROM public.profiles AS p
  WHERE btrim(coalesce(p.school_name, '')) <> ''
    AND btrim(coalesce(p.school_region, '')) <> ''
  GROUP BY 1, 2
) AS grouped
WHERE NOT EXISTS (
  SELECT 1
  FROM public.teams AS t
  WHERE t.team_type IN ('school', '학교')
    AND public.school_names_match(t.name, grouped.school_name_short)
    AND public.admin_regions_compatible(t.region, grouped.school_region)
);

-- 예전에 "천안"처럼 짧게 저장된 학교 팀 지역을 표준 라벨로 맞춘다.
UPDATE public.teams AS t
SET region = matched.school_region
FROM (
  SELECT DISTINCT
    regexp_replace(btrim(school_name), '초등학교$', '초') AS school_name_short,
    school_region
  FROM public.profiles
  WHERE btrim(coalesce(school_name, '')) <> ''
    AND btrim(coalesce(school_region, '')) <> ''
) AS matched
WHERE t.team_type IN ('school', '학교')
  AND public.school_names_match(t.name, matched.school_name_short)
  AND public.admin_regions_compatible(t.region, matched.school_region)
  AND t.region IS DISTINCT FROM matched.school_region
  AND NOT EXISTS (
    SELECT 1
    FROM public.teams AS other
    WHERE other.id <> t.id
      AND other.team_type IN ('school', '학교')
      AND other.name = t.name
      AND other.region = matched.school_region
  );

INSERT INTO public.team_members (user_id, team_id, is_active, is_primary)
SELECT
  p.id,
  picked.team_id,
  true,
  NOT EXISTS (
    SELECT 1
    FROM public.team_members AS current_primary
    WHERE current_primary.user_id = p.id
      AND current_primary.is_active IS NOT FALSE
      AND coalesce(current_primary.is_primary, false) = true
  )
FROM public.profiles AS p
JOIN LATERAL (
  SELECT t.id AS team_id
  FROM public.teams AS t
  WHERE t.team_type IN ('school', '학교')
    AND public.school_names_match(t.name, p.school_name)
    AND public.admin_regions_compatible(t.region, p.school_region)
  ORDER BY (t.name ~ '배구단$') DESC, (t.region = p.school_region) DESC, t.id
  LIMIT 1
) AS picked ON true
WHERE btrim(coalesce(p.school_name, '')) <> ''
  AND btrim(coalesce(p.school_region, '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.team_members AS existing
    WHERE existing.user_id = p.id
      AND existing.team_id = picked.team_id
  );

UPDATE public.team_members AS member
SET is_active = true
FROM public.profiles AS p
JOIN LATERAL (
  SELECT t.id AS team_id
  FROM public.teams AS t
  WHERE t.team_type IN ('school', '학교')
    AND public.school_names_match(t.name, p.school_name)
    AND public.admin_regions_compatible(t.region, p.school_region)
  ORDER BY (t.name ~ '배구단$') DESC, (t.region = p.school_region) DESC, t.id
  LIMIT 1
) AS picked ON true
WHERE member.user_id = p.id
  AND member.team_id = picked.team_id
  AND member.is_active IS FALSE
  AND btrim(coalesce(p.school_name, '')) <> ''
  AND btrim(coalesce(p.school_region, '')) <> '';

-- -----------------------------------------------------------------------------
-- 온보딩/프로필 저장이 호출하는 배치 함수.
-- SECURITY DEFINER 라서 학교 팀 생성·가입이 RLS에 막히지 않는다.
-- 호출자는 로그인한 본인만 배치할 수 있다.
-- -----------------------------------------------------------------------------
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
    ORDER BY (t.name ~ '배구단$') DESC, (t.region = v_region) DESC, t.id
    LIMIT 1;

    EXIT WHEN v_team_id IS NOT NULL;

    BEGIN
      INSERT INTO public.teams (name, region, team_type, leader_id, status, is_public)
      VALUES (v_name || ' 배구단', v_region, 'school', uid, 'active', true)
      RETURNING id, name INTO v_team_id, v_team_name;
      v_created := true;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 3 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

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

REVOKE ALL ON FUNCTION public.ensure_school_team_membership(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_school_team_membership(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_school_team_membership(text, text) TO authenticated;

-- RLS가 이미 켜져 있을 때만 학교 팀 조회/가입 정책을 추가한다.
-- 정책은 permissive 라서 기존 동호회 정책과 OR 로 합쳐지고, 동호회 조건을 바꾸지 않는다.
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
    DROP POLICY IF EXISTS teams_read_school_teams ON public.teams;
    CREATE POLICY teams_read_school_teams ON public.teams
      FOR SELECT TO authenticated
      USING (
        team_type IN ('school', '학교')
        AND (
          coalesce(is_public, true) = true
          OR EXISTS (
            SELECT 1
            FROM public.team_members AS member
            WHERE member.team_id = teams.id
              AND member.user_id = auth.uid()
          )
        )
      );

    DROP POLICY IF EXISTS teams_insert_school_team_as_leader ON public.teams;
    CREATE POLICY teams_insert_school_team_as_leader ON public.teams
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND team_type IN ('school', '학교')
        AND leader_id = auth.uid()
        AND coalesce(is_public, true) = true
      );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'team_members'
      AND c.relrowsecurity
  ) THEN
    DROP POLICY IF EXISTS team_members_read_school_team ON public.team_members;
    CREATE POLICY team_members_read_school_team ON public.team_members
      FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.teams AS t
          WHERE t.id = team_members.team_id
            AND t.team_type IN ('school', '학교')
            AND coalesce(t.is_public, true) = true
        )
      );

    DROP POLICY IF EXISTS team_members_join_school_team ON public.team_members;
    CREATE POLICY team_members_join_school_team ON public.team_members
      FOR INSERT TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.teams AS t
          WHERE t.id = team_members.team_id
            AND t.team_type IN ('school', '학교')
            AND coalesce(t.is_public, true) = true
        )
      );
  END IF;
END $$;
