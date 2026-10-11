-- =============================================================================
-- 회원 탈퇴 RPC (App Store Guideline 5.1.1v)
--
-- 로그인한 본인(auth.uid())만 삭제할 수 있다.
-- 개인 데이터/프로필을 정리한 뒤 auth.users 를 삭제해 재로그인이 불가능하게 한다.
-- 다른 사용자와 공유되는 경기(matches) 자체는 남긴다.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  rec record;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  -- 1) 본인 전용 행 삭제
  FOR rec IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name IN (
        'notifications',
        'team_members',
        'match_applications',
        'poll_votes',
        'user_tags',
        'match_comments',
        'match_evaluations',
        'feedbacks'
      )
      AND c.column_name IN (
        'user_id',
        'sender_id',
        'receiver_id',
        'target_user_id',
        'applicant_user_id',
        'evaluator_id'
      )
  LOOP
    EXECUTE format(
      'DELETE FROM public.%I WHERE %I = $1',
      rec.table_name,
      rec.column_name
    ) USING uid;
  END LOOP;

  -- 2) 다른 테이블이 참조하는 본인 FK 를 NULL 로 풀어 삭제 차단을 막는다
  FOR rec IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name <> 'profiles'
      AND c.column_name IN (
        'invited_by',
        'host_user_id',
        'recorder_host_id',
        'recorder_away_id',
        'leader_id',
        'created_by',
        'evaluator_id',
        'retro_claim_user_id'
      )
      AND c.is_nullable = 'YES'
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET %I = NULL WHERE %I = $1',
      rec.table_name,
      rec.column_name,
      rec.column_name
    ) USING uid;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'invited_by'
  ) THEN
    UPDATE public.profiles SET invited_by = NULL WHERE invited_by = uid;
  END IF;

  DELETE FROM public.profiles WHERE id = uid;

  BEGIN
    DELETE FROM storage.objects
    WHERE bucket_id = 'avatars'
      AND (name LIKE uid::text || '_%' OR name LIKE uid::text || '/%');
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
