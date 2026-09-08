import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { formatTeamDisplayName } from '../lib/teamStatus';
import { teamsInclude } from '../lib/roster';
import { getSafeTeamName } from '../lib/utils';
import { resolveTeamName, getTeamIcon, isSameName } from '../lib/nameUtils';
import { listMatchSetRows } from '../lib/matchSets';
import { isUnofficialMatch } from '../lib/officialMatch';
import { canConvertMatchToGuest, isGuestBindPending, isGuestMatch, isSoloGuestMatch } from '../lib/guestMatch';

export interface MatchData {
  id: string;
  host_user_id: string;
  host_team_name: string;
  away_team_name?: string;
  region?: string;
  match_date: string;
  match_time: string;
  location: string;
  format: string;
  description: string;
  contact_info?: string;
  status: string;
  winner_team?: string;
  result_submitter_team?: string;
  submitted_by_name?: string;
  approved_by_name?: string;
  roster_updated_by_name?: string;
  roster_updated_at?: string;
  set_scores?: string | null;
  match_sets?: Array<{ set_number?: number; host_score?: number; away_score?: number }>;
  match_events?: Array<{ set_index?: number; event_type?: string; is_canceled?: boolean; host_score?: number; away_score?: number }>;
  sets?: Array<{ set_number?: number; host_score?: number; away_score?: number; hostScore?: number; awayScore?: number }>;
  host_roster?: string;
  away_roster?: string;
  created_at: string;
  need_mercenary?: boolean;
  mercenary_details?: string;
  host_youtube_url?: string | null;
  away_youtube_url?: string | null;
  is_official?: boolean | null;
  is_guest_match?: boolean | null;
  host_team_id?: string | null;
  away_team_id?: string | null;
  retro_claim_status?: string | null;
  retro_claim_team_name?: string | null;
  short_code?: string | null;
}

export interface ApplicationData {
  id: string;
  match_id: string;
  applicant_user_id: string;
  applicant_team_name: string;
  status: string;
  application_type?: 'team' | 'mercenary';
  applicant_contact?: string;
}

interface MatchCardProps {
  match: MatchData;
  myTeams: string[];
  myApplications: ApplicationData[];
  currentUserId?: string;
  expandedMercenaryMatchIds: string[];
  actionLoading: boolean;
  onToggleMercenaryDetails: (matchId: string) => void;
  onOpenCommentModal: (match: MatchData) => void;
  onOpenYoutube: (url?: string) => void;
  onOpenEvaluationModal: (match: MatchData) => void;
  onOpenResultModal: (match: MatchData) => void;
  onOpenRosterOnlyModal: (match: MatchData) => void;
  onApproveResult: (match: MatchData, isApproved: boolean) => void;
  onCancelApplication: (match: MatchData) => void;
  onOpenApplicantModal: (match: MatchData) => void;
  onDeleteMatch: (match: MatchData) => void;
  onOpenMercenaryModal: (match: MatchData) => void;
  onApplyMatch: (match: MatchData) => void;
  onOpenReportModal?: (match: MatchData) => void; // 💡 에러 해결: Props 타입 추가
  onClaimRetroMatch?: (match: MatchData) => void;
  onApproveRetroClaim?: (match: MatchData, approved: boolean) => void;
  onConvertToGuestMatch?: (match: MatchData) => void;
  onBindGuestTeam?: (match: MatchData) => void;
  teamStatusByName?: Record<string, string>;
  teamTypeByName?: Record<string, string>;
}

export default function MatchCard({
  match,
  myTeams,
  myApplications,
  currentUserId,
  expandedMercenaryMatchIds,
  actionLoading: _actionLoading,
  onToggleMercenaryDetails,
  onOpenCommentModal,
  onOpenYoutube,
  onOpenEvaluationModal: _onOpenEvaluationModal,
  onOpenResultModal,
  onOpenRosterOnlyModal,
  onApproveResult,
  onCancelApplication,
  onOpenApplicantModal,
  onDeleteMatch,
  onOpenMercenaryModal,
  onApplyMatch,
  onOpenReportModal,
  onClaimRetroMatch,
  onApproveRetroClaim,
  onConvertToGuestMatch,
  onBindGuestTeam,
  teamStatusByName,
  teamTypeByName,
}: MatchCardProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const openScoreboard = () => router.push({ pathname: '/scoreboard', params: { matchId: match.id } });

  const copyLiveLink = async () => {
    const slug = match.short_code || match.id;
    const url = `https://t-volley-live.vercel.app/live/${slug}`;
    await Clipboard.setStringAsync(url);
    Alert.alert('복사 완료', '라이브 전광판 링크가 복사되었습니다! 카톡에 공유해보세요.');
  };

  const displayTeamName = (name?: string | null) => {
    const resolved = getSafeTeamName(name);
    const statusKey = resolveTeamName(name);
    return formatTeamDisplayName(resolved, statusKey ? teamStatusByName?.[statusKey] : undefined);
  };

  const hostName = resolveTeamName(match.host_team_name);
  const awayName = match.away_team_name ? resolveTeamName(match.away_team_name) : '';
  const hostIcon = getTeamIcon(teamTypeByName?.[hostName] || teamTypeByName?.[String(match.host_team_name || '')]);
  const awayIcon = getTeamIcon(teamTypeByName?.[awayName] || teamTypeByName?.[String(match.away_team_name || '')]);

  const isHost = teamsInclude(myTeams, match.host_team_name);
  const isAway = match.away_team_name ? teamsInclude(myTeams, match.away_team_name) : false;
  const myApp = myApplications.find((app) => app.match_id === match.id);
  const myMercenaryApp = myApplications.find(
    (app) => app.match_id === match.id && app.applicant_user_id === currentUserId && app.application_type === 'mercenary'
  );
  const isMyMatch = isHost || isAway;

  const isCompleted = match.status === 'completed';
  const isFriendly = match.status === 'friendly';
  const isIntramural = match.status === 'intramural';
  const isPending = match.status === 'pending_result';
  const isMatched = match.status === 'matched';
  const isOpen = match.status === 'open';
  const isDrawResult = match.winner_team === 'draw' || match.winner_team === '무승부';
  const setRows = listMatchSetRows(match).map((s) => ({
    set_number: s.setNumber,
    host_score: s.host_score,
    away_score: s.away_score,
  }));
  const hasSetRecord = setRows.length > 0 || !!(match.set_scores && String(match.set_scores).trim());

  const isBothTeams = isHost && isAway;
  const submitterIsMyHostTeam = match.result_submitter_team === match.host_team_name;
  const submitterIsMyAwayTeam = match.result_submitter_team === match.away_team_name;

  const canApprove = isBothTeams
    ? true
    : (isHost && submitterIsMyAwayTeam) || (isAway && submitterIsMyHostTeam);

  const availableNonHostTeams = myTeams.filter((t) => t !== match.host_team_name);
  const isMercenaryExpanded = expandedMercenaryMatchIds.includes(match.id);

  const isFinished = isCompleted || isFriendly || (isIntramural && !!match.winner_team);
  const isLive = isMatched || (isIntramural && !match.winner_team);
  const isRecruiting = isOpen;
  const unofficial = isUnofficialMatch(match);
  const guestMatch = isGuestMatch(match);
  const soloGuest = isSoloGuestMatch(match);
  const guestBindPending = isGuestBindPending(match);
  const matchingAwayTeam = myTeams.find((t) => isSameName(t, awayName));
  const canClaimRetro = !!(
    unofficial
    && !guestMatch
    && !match.away_team_id
    && matchingAwayTeam
    && match.retro_claim_status !== 'pending'
    && match.retro_claim_status !== 'approved'
    && onClaimRetroMatch
  );
  const claimPending = unofficial && !guestMatch && match.retro_claim_status === 'pending';
  const canApproveRetro = !!(
    isHost
    && claimPending
    && onApproveRetroClaim
    && currentUserId
    && currentUserId === match.host_user_id
  );
  const canConvertToGuest = !!(isHost && onConvertToGuestMatch && canConvertMatchToGuest(match));
  const canBindGuestTeam = !!(isHost && soloGuest && onBindGuestTeam);

  return (
    <View style={[styles.matchCard, { paddingBottom: 14 + Math.min(insets.bottom, 0) }]}>
      <View style={styles.cardMetaRow}>
        <View style={styles.headerLeft}>
          <View style={styles.regionTagPill}>
            <Text style={styles.regionTagPillText} numberOfLines={1}>📍 {match.region || '천안'}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              isFinished ? styles.statusCompleted : isRecruiting ? styles.statusOpen : styles.statusMatched,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isFinished ? styles.statusTextCompleted : isRecruiting ? styles.statusTextOpen : styles.statusTextMatched,
              ]}
              numberOfLines={1}
            >
              {isFinished ? '종료' : isRecruiting ? '모집중' : '진행중'}
            </Text>
          </View>
          {match.need_mercenary && (
            <TouchableOpacity
              style={styles.mercenaryBadge}
              onPress={() => onToggleMercenaryDetails(match.id)}
              activeOpacity={0.7}
              hitSlop={8}
            >
              <Text style={styles.mercenaryBadgeText} numberOfLines={1}>
                🙋‍♂️ 용병 {isMercenaryExpanded ? '▴' : '▾'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.headerRight}>
          {isRecruiting && isHost && availableNonHostTeams.length > 0 && !(myApp && myApp.application_type !== 'mercenary') && (
            <TouchableOpacity
              style={styles.headerUtilBtn}
              onPress={() => onApplyMatch(match)}
              activeOpacity={0.7}
              hitSlop={8}
            >
              <Text style={styles.headerUtilBtnText}>다른 팀 신청</Text>
            </TouchableOpacity>
          )}
          {isLive && isAway && (
            <TouchableOpacity
              style={styles.headerUtilBtn}
              onPress={() => onCancelApplication(match)}
              activeOpacity={0.7}
              hitSlop={8}
            >
              <Text style={styles.headerUtilBtnText}>매칭 취소</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.chatIconBtn}
            onPress={() => onOpenCommentModal(match)}
            activeOpacity={0.7}
            hitSlop={8}
          >
            <Text style={styles.chatIconBtnText}>💬 소통방</Text>
          </TouchableOpacity>
          {isHost && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => onDeleteMatch(match)}
              hitSlop={8}
            >
              <Text style={styles.deleteBtnText}>🗑️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.scoreboardRow}>
        <View style={styles.teamColLeft}>
          <Text style={styles.hostTeamText} numberOfLines={1}>
            {hostIcon} {displayTeamName(match.host_team_name)}
          </Text>
          <Text style={styles.teamRoleLabel}>주최팀</Text>
        </View>

        <View style={styles.vsPill}>
          <Text style={styles.vsPillText}>VS</Text>
        </View>

        <View style={styles.teamColRight}>
          <Text style={[styles.awayTeamText, !match.away_team_name && styles.textMuted]} numberOfLines={1}>
            {match.away_team_name ? `${awayIcon} ${displayTeamName(match.away_team_name)}` : '상대 모집중'}
          </Text>
          <Text style={styles.teamRoleLabel}>상대팀</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.setScoreBox}
        onPress={openScoreboard}
        activeOpacity={0.7}
        hitSlop={8}
      >
        <View style={styles.setScoreBoxBody}>
          <Text style={styles.setScoreNudge}>📊 실시간 전광판 진입</Text>
          {hasSetRecord ? (
            <View style={styles.setScorePillsRow}>
              {(setRows.length > 0 ? setRows : [{ set_number: 1, host_score: 0, away_score: 0 }]).map((s, i) => (
                <View key={`set-${s.set_number || i + 1}`} style={styles.setScorePill}>
                  <Text style={styles.setScorePillLabel}>{s.set_number || i + 1}세트</Text>
                  <Text style={styles.setScorePillValue}>{s.host_score}:{s.away_score}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.setScoreEmpty}>기록 없음</Text>
          )}
        </View>
        <Text style={styles.setScoreChevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.liveLinkCopyBtn}
        onPress={copyLiveLink}
        activeOpacity={0.85}
        hitSlop={8}
      >
        <Text style={styles.liveLinkCopyBtnText}>🔗 라이브 전광판 링크 복사</Text>
      </TouchableOpacity>

      {match.need_mercenary && match.mercenary_details && isMercenaryExpanded ? (
        <View style={styles.mercenaryInfoBox}>
          <Text style={styles.mercenaryInfoTitle}>🙋‍♂️ 용병 상세 조건</Text>
          <Text style={styles.mercenaryInfoText}>{match.mercenary_details}</Text>
        </View>
      ) : null}

      <View style={styles.matchDetailsBox}>
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>📅</Text>
          <Text style={styles.detailText}>
            {match.match_date} ({match.match_time})
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>🏢</Text>
          <Text style={styles.detailText}>{match.location}</Text>
        </View>
      </View>

      {match.roster_updated_by_name && (
        <View style={styles.rosterAuditBox}>
          <Text style={styles.rosterAuditText}>
            📝 출전명단 업데이트: {match.roster_updated_at} ({match.roster_updated_by_name} 선생님)
          </Text>
        </View>
      )}

      {match.description ? (
        <View style={styles.descriptionBox}>
          <Text style={styles.descriptionText}>"{match.description}"</Text>
        </View>
      ) : null}

      {match.host_youtube_url || match.away_youtube_url ? (
        <View style={styles.youtubeRow}>
          {match.host_youtube_url ? (
            <TouchableOpacity
              style={styles.youtubeBarBtn}
              onPress={() => onOpenYoutube(match.host_youtube_url!)}
              hitSlop={8}
            >
              <Text style={styles.youtubeBarBtnText}>🎥 [{displayTeamName(match.host_team_name)}] 영상 ▶</Text>
            </TouchableOpacity>
          ) : null}
          {match.away_youtube_url ? (
            <TouchableOpacity
              style={[styles.youtubeBarBtn, styles.youtubeBarBtnAway]}
              onPress={() => onOpenYoutube(match.away_youtube_url!)}
              hitSlop={8}
            >
              <Text style={[styles.youtubeBarBtnText, styles.youtubeBarBtnAwayText]}>
                🎥 [{match.away_team_name ? displayTeamName(match.away_team_name) : '상대팀'}] 영상 ▶
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actionArea}>
        {isFinished && (
          <View style={styles.actionStack}>
            <View style={[styles.infoBanner, (isFriendly || unofficial) && styles.infoBannerFriendly, isIntramural && styles.infoBannerIntramural]}>
              <Text style={[styles.infoBannerText, (isFriendly || unofficial) && styles.infoBannerTextFriendly, isIntramural && styles.infoBannerTextIntramural]} numberOfLines={2}>
                {guestMatch
                  ? `👤 게스트 팀 · 팀 랭킹 유예 · ${isDrawResult ? '무승부' : `${match.winner_team} 승리!`}`
                  : unofficial
                  ? `🤝 비공식 · 랭킹 제외 · ${isDrawResult ? '무승부' : `${match.winner_team} 승리!`}`
                  : isFriendly
                  ? `🤝 친선: ${isDrawResult ? '무승부' : `${match.winner_team} 승리!`}`
                  : isIntramural
                  ? (isDrawResult ? '🤝 무승부' : `🏆 ${match.winner_team} 승리!`)
                  : `🏆 전적: ${isDrawResult ? '무승부' : `${match.winner_team} 승리!`}`}
              </Text>
              {isCompleted && match.approved_by_name ? (
                <Text style={styles.auditSubText}>(최종 확정: {match.approved_by_name} 선생님 승인)</Text>
              ) : null}
              {claimPending ? (
                <Text style={styles.auditSubText}>소급 승인 대기: {match.retro_claim_team_name || '상대팀'}</Text>
              ) : null}
            </View>
            <View style={styles.inlineActionRow}>
              {onOpenReportModal ? (
                <TouchableOpacity
                  style={[styles.mainActionBtn, styles.flex7]}
                  onPress={() => onOpenReportModal(match)}
                  activeOpacity={0.85}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.mainActionBtnText} numberOfLines={1}>📊 경기 분석 리포트 보기</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.flex7} />
              )}
              <TouchableOpacity
                style={[styles.subActionBtn, styles.flex3]}
                onPress={() => onOpenResultModal(match)}
                activeOpacity={0.85}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.subActionBtnText} numberOfLines={1}>✏️ 결과 수정</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.inlineActionRow}>
              <TouchableOpacity
                style={[styles.subActionBtn, styles.flex7]}
                onPress={() => onOpenRosterOnlyModal(match)}
                activeOpacity={0.85}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.subActionBtnText} numberOfLines={1}>선수 명단 수정</Text>
              </TouchableOpacity>
              {canClaimRetro ? (
                <TouchableOpacity
                  style={[styles.mainActionBtn, styles.flex3]}
                  onPress={() => onClaimRetroMatch?.(match)}
                  activeOpacity={0.85}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.mainActionBtnText} numberOfLines={1}>소급 신청</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {canApproveRetro ? (
              <View style={styles.inlineActionRow}>
                <TouchableOpacity
                  style={[styles.resultBtn, styles.approveBtn, styles.flex7]}
                  onPress={() => onApproveRetroClaim?.(match, true)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.resultBtnText} numberOfLines={1}>소급 승인</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cancelAppBtn, styles.flex3]}
                  onPress={() => onApproveRetroClaim?.(match, false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.cancelAppBtnText} numberOfLines={1}>거절</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {canBindGuestTeam ? (
              <TouchableOpacity
                style={styles.guestBindBtn}
                onPress={() => onBindGuestTeam?.(match)}
                activeOpacity={0.85}
                hitSlop={8}
              >
                <Text style={styles.guestBindBtnText} numberOfLines={1}>상대 팀 소급 연동</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {isLive && (
          <View style={styles.actionStack}>
            <TouchableOpacity
              style={styles.liveMainBtn}
              onPress={openScoreboard}
              activeOpacity={0.85}
              hitSlop={8}
            >
              <Text style={styles.liveMainBtnText} numberOfLines={1}>⚡ 실시간 전광판 / 기록 진입</Text>
            </TouchableOpacity>
            {guestMatch ? (
              <View style={[styles.infoBanner, styles.infoBannerFriendly]}>
                <Text style={[styles.infoBannerText, styles.infoBannerTextFriendly]} numberOfLines={2}>
                  {guestBindPending
                    ? '👤 상대 팀 지정됨 · 종료 후 상대 승인/재수정 필요 · 팀 랭킹 유예'
                    : '👤 게스트 팀 경기 · 팀 랭킹 유예 · 상대 승인 없이 종료 가능'}
                </Text>
              </View>
            ) : null}
            {canBindGuestTeam ? (
              <TouchableOpacity
                style={styles.guestBindBtn}
                onPress={() => onBindGuestTeam?.(match)}
                activeOpacity={0.85}
                hitSlop={8}
              >
                <Text style={styles.guestBindBtnText} numberOfLines={1}>상대 팀 소급 연동</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {isPending && (
          <View style={styles.actionStack}>
            <View style={styles.pendingBanner}>
              <Text style={styles.pendingBannerText}>
                제출 결과: {isDrawResult ? '무승부' : `'${match.winner_team}' 승리`}
              </Text>
              {match.submitted_by_name && (
                <Text style={styles.auditSubText}>
                  {guestBindPending
                    ? `(제출자: ${match.submitted_by_name} 선생님 ➔ 상대팀 승인 또는 재수정)`
                    : `(제출자: ${match.submitted_by_name} 선생님 ➔ 상대팀 승인 대기)`}
                </Text>
              )}
            </View>
            {canApprove ? (
              <View style={styles.inlineActionRow}>
                <TouchableOpacity
                  style={[styles.resultBtn, styles.approveBtn, styles.flex7]}
                  onPress={() => onApproveResult(match, true)}
                  hitSlop={8}
                >
                  <Text style={styles.resultBtnText} numberOfLines={1}>✅ 승인</Text>
                </TouchableOpacity>
                {guestBindPending ? (
                  <TouchableOpacity
                    style={[styles.subActionBtn, styles.flex3]}
                    onPress={() => onOpenResultModal(match)}
                    hitSlop={8}
                  >
                    <Text style={styles.subActionBtnText} numberOfLines={1}>재수정</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.cancelAppBtn, styles.flex3]}
                    onPress={() => onApproveResult(match, false)}
                    hitSlop={8}
                  >
                    <Text style={styles.cancelAppBtnText} numberOfLines={1}>❌ 거절</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.actionStack}>
                <Text style={styles.pendingWaitText}>⏳ 상대팀 승인 대기 중입니다</Text>
                {guestBindPending ? (
                  <TouchableOpacity
                    style={styles.subActionBtn}
                    onPress={() => onOpenResultModal(match)}
                    hitSlop={8}
                  >
                    <Text style={styles.subActionBtnText} numberOfLines={1}>✏️ 결과 재수정</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>
        )}

        {isRecruiting && (
          isHost ? (
            <View style={styles.actionStack}>
              <TouchableOpacity
                style={styles.hostManageBtn}
                onPress={() => onOpenApplicantModal(match)}
                activeOpacity={0.85}
                hitSlop={8}
              >
                <Text style={styles.hostManageBtnText} numberOfLines={1}>📋 신청 현황 / 승인</Text>
              </TouchableOpacity>
              {canConvertToGuest ? (
                <TouchableOpacity
                  style={styles.guestConvertBtn}
                  onPress={() => onConvertToGuestMatch?.(match)}
                  activeOpacity={0.85}
                  hitSlop={8}
                >
                  <Text style={styles.guestConvertBtnText} numberOfLines={1}>게스트 팀으로 변경</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : myApp && myApp.application_type !== 'mercenary' ? (
            <View style={styles.appliedBadge}>
              <Text style={styles.appliedBadgeText} numberOfLines={1}>✅ 신청 완료</Text>
              <TouchableOpacity onPress={() => onCancelApplication(match)} hitSlop={8}>
                <Text style={styles.cancelAppBtnText}>취소</Text>
              </TouchableOpacity>
            </View>
          ) : availableNonHostTeams.length > 0 ? (
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={() => onApplyMatch(match)}
              activeOpacity={0.85}
              hitSlop={8}
            >
              <Text style={styles.applyBtnText} numberOfLines={1}>📝 참가 신청</Text>
            </TouchableOpacity>
          ) : match.need_mercenary && myMercenaryApp ? (
            <View style={[styles.appliedBadge, styles.appliedBadgeMercenary]}>
              <Text style={[styles.appliedBadgeText, styles.appliedBadgeTextMercenary]} numberOfLines={1}>🙋‍♂️ 용병 신청 완료</Text>
              <TouchableOpacity onPress={() => onCancelApplication(match)} hitSlop={8}>
                <Text style={styles.cancelAppBtnText}>취소</Text>
              </TouchableOpacity>
            </View>
          ) : match.need_mercenary ? (
            <TouchableOpacity
              style={styles.applyMercenaryBtn}
              onPress={() => onOpenMercenaryModal(match)}
              hitSlop={8}
            >
              <Text style={styles.applyMercenaryBtnText} numberOfLines={1}>🙋‍♂️ 용병 신청</Text>
            </TouchableOpacity>
          ) : null
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  matchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  cardMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 },
  headerLeft: { flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 1, flexWrap: 'wrap' },
  headerRight: { flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 0 },
  regionTagPill: { height: 28, borderRadius: 14, paddingHorizontal: 10, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  regionTagPillText: { fontSize: 12, fontWeight: '600', color: '#475569', lineHeight: 16, includeFontPadding: false },
  chatIconBtn: {
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chatIconBtnText: { fontSize: 12, fontWeight: '600', color: '#475569', lineHeight: 16, includeFontPadding: false },
  scoreboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 8,
  },
  teamColLeft: { flex: 1, alignItems: 'flex-start' },
  teamColRight: { flex: 1, alignItems: 'flex-end' },
  hostTeamText: { fontSize: 15, fontWeight: '700', color: Colors.primary, lineHeight: 20, includeFontPadding: false },
  awayTeamText: { fontSize: 15, fontWeight: '700', color: '#0284C7', lineHeight: 20, includeFontPadding: false },
  teamRoleLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginTop: 2, lineHeight: 13, includeFontPadding: false },
  vsPill: { backgroundColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginHorizontal: 10 },
  vsPillText: { fontSize: 11, fontWeight: '900', color: '#64748B', lineHeight: 14, includeFontPadding: false },
  textMuted: { color: '#94A3B8', fontSize: 14, fontWeight: '700', lineHeight: 18 },
  statusBadge: { height: 28, borderRadius: 14, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  statusOpen: { backgroundColor: '#F0FDF4' },
  statusMatched: { backgroundColor: '#EFF6FF' },
  statusCompleted: { backgroundColor: '#F1F5F9' },
  statusText: { fontSize: 12, fontWeight: '600', lineHeight: 16, includeFontPadding: false },
  statusTextOpen: { color: '#166534' },
  statusTextMatched: { color: '#1D4ED8' },
  statusTextCompleted: { color: '#334155' },
  mercenaryBadge: { height: 28, borderRadius: 14, paddingHorizontal: 10, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  mercenaryBadgeText: { fontSize: 12, fontWeight: '600', color: '#B45309', lineHeight: 16, includeFontPadding: false },
  mercenaryInfoBox: { backgroundColor: '#FEFCE8', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 8 },
  mercenaryInfoTitle: { fontSize: 11, fontWeight: '800', color: '#B45309', lineHeight: 14 },
  mercenaryInfoText: { fontSize: 12, color: '#92400E', fontWeight: '700', marginTop: 2, lineHeight: 16 },
  matchDetailsBox: { gap: 2 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailIcon: { fontSize: 13, lineHeight: 16 },
  detailText: { fontSize: 13, color: '#334155', fontWeight: '600', lineHeight: 18 },
  rosterAuditBox: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#EFF6FF', borderRadius: 6, borderWidth: 1, borderColor: '#BFDBFE' },
  rosterAuditText: { fontSize: 10.5, fontWeight: '800', color: '#1D4ED8', lineHeight: 14 },
  descriptionBox: { marginTop: 6, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: '#93C5FD' },
  descriptionText: { fontSize: 12.5, color: '#64748B', fontStyle: 'italic', lineHeight: 18 },
  youtubeRow: { marginTop: 8, gap: 6 },
  youtubeBarBtn: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  youtubeBarBtnText: { color: '#DC2626', fontSize: 12, fontWeight: '800', lineHeight: 16 },
  youtubeBarBtnAway: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  youtubeBarBtnAwayText: { color: '#1D4ED8' },

  headerUtilBtn: { height: 28, borderRadius: 14, paddingHorizontal: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerUtilBtnText: { fontSize: 12, fontWeight: '600', color: '#475569', lineHeight: 16, includeFontPadding: false },
  actionArea: { marginTop: 10 },
  actionStack: { gap: 8 },
  inlineActionRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  flex7: { flex: 7, minWidth: 0 },
  flex3: { flex: 3, flexShrink: 0 },
  mainActionBtn: {
    backgroundColor: '#FEFCE8',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE047',
  },
  mainActionBtnText: { color: '#A16207', fontSize: 13, fontWeight: '800', lineHeight: 18, includeFontPadding: false },
  subActionBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    flexShrink: 0,
  },
  subActionBtnText: { color: '#334155', fontSize: 12, fontWeight: '800', lineHeight: 16, includeFontPadding: false },
  hostManageBtn: {
    backgroundColor: '#0EA5E9',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostManageBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', lineHeight: 18, includeFontPadding: false },
  guestConvertBtn: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderStyle: 'dashed',
  },
  guestConvertBtnText: { color: '#334155', fontSize: 13, fontWeight: '800', lineHeight: 18, includeFontPadding: false },
  guestBindBtn: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  guestBindBtnText: { color: '#1D4ED8', fontSize: 13, fontWeight: '800', lineHeight: 18, includeFontPadding: false },
  liveMainBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  liveMainBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', lineHeight: 18, includeFontPadding: false },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  deleteBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '600', lineHeight: 16, includeFontPadding: false },
  resultBtn: { backgroundColor: Colors.primary, borderRadius: 10, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  resultBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', lineHeight: 18, includeFontPadding: false },
  approveBtn: { backgroundColor: '#10B981' },
  applyBtn: { backgroundColor: '#0EA5E9', borderRadius: 10, minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  applyBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', lineHeight: 18, includeFontPadding: false },
  applyMercenaryBtn: { backgroundColor: '#D97706', borderRadius: 10, minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  applyMercenaryBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', lineHeight: 18, includeFontPadding: false },
  appliedBadge: { flexDirection: 'row', gap: 6, backgroundColor: '#F0FDF4', borderRadius: 10, minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BBF7D0' },
  appliedBadgeMercenary: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  appliedBadgeText: { color: '#15803D', fontSize: 12, fontWeight: '800', lineHeight: 16, includeFontPadding: false },
  appliedBadgeTextMercenary: { color: '#B45309' },
  cancelAppBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    minHeight: 44,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cancelAppBtnText: { color: '#DC2626', fontSize: 12, fontWeight: '800', lineHeight: 16, includeFontPadding: false },
  matchedBanner: { backgroundColor: '#EFF6FF', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center' },
  matchedBannerText: { color: '#1E40AF', fontSize: 12, fontWeight: '800', lineHeight: 16, textAlign: 'center', includeFontPadding: false },
  infoBanner: { backgroundColor: '#F1F5F9', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  infoBannerFriendly: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
  infoBannerIntramural: { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF' },
  infoBannerText: { color: '#0F172A', fontSize: 14, fontWeight: '800', lineHeight: 20, textAlign: 'center', includeFontPadding: false },
  infoBannerTextFriendly: { color: '#64748B' },
  infoBannerTextIntramural: { color: '#6B21A8' },
  setScoreBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 6,
  },
  setScoreBoxBody: { flex: 1, minWidth: 0 },
  setScoreNudge: { fontSize: 11, color: '#94A3B8', fontWeight: '700', lineHeight: 14, includeFontPadding: false, marginBottom: 6 },
  setScoreChevron: { fontSize: 16, color: '#94A3B8', lineHeight: 20, includeFontPadding: false, fontWeight: '400' },
  liveLinkCopyBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    marginBottom: 8,
  },
  liveLinkCopyBtnText: { fontSize: 12, fontWeight: '800', color: '#1D4ED8', lineHeight: 16, includeFontPadding: false },
  setScoreEmpty: { fontSize: 13, color: '#94A3B8', fontWeight: '700', lineHeight: 18, includeFontPadding: false },
  setScorePillsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8 },
  setScorePill: { backgroundColor: '#0F172A', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5, minWidth: 72, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  setScorePillLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', lineHeight: 13, includeFontPadding: false },
  setScorePillValue: { fontSize: 15, fontWeight: '800', color: '#F8FAFC', marginTop: 1, lineHeight: 20, includeFontPadding: false },
  auditSubText: { fontSize: 10.5, color: '#64748B', fontWeight: '700', marginTop: 2, lineHeight: 14, includeFontPadding: false },
  pendingBanner: { backgroundColor: '#FEFCE8', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#FEF08A' },
  pendingBannerText: { color: '#A16207', fontSize: 13, fontWeight: '800', lineHeight: 18, includeFontPadding: false },
  pendingWaitText: { textAlign: 'center', color: '#64748B', fontSize: 12.5, fontWeight: '800', lineHeight: 16, includeFontPadding: false },
});
