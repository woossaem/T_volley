import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';
import { formatTeamDisplayName } from '../lib/teamStatus';

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
  host_roster?: string;
  away_roster?: string;
  created_at: string;
  need_mercenary?: boolean;
  mercenary_details?: string;
  host_youtube_url?: string | null;
  away_youtube_url?: string | null;
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
  teamStatusByName?: Record<string, string>;
}

export default function MatchCard({
  match,
  myTeams,
  myApplications,
  currentUserId,
  expandedMercenaryMatchIds,
  actionLoading,
  onToggleMercenaryDetails,
  onOpenCommentModal,
  onOpenYoutube,
  onOpenEvaluationModal,
  onOpenResultModal,
  onOpenRosterOnlyModal,
  onApproveResult,
  onCancelApplication,
  onOpenApplicantModal,
  onDeleteMatch,
  onOpenMercenaryModal,
  onApplyMatch,
  onOpenReportModal,
  teamStatusByName,
}: MatchCardProps) {
  const router = useRouter();

  const displayTeamName = (name?: string | null) =>
    formatTeamDisplayName(name, name ? teamStatusByName?.[name] : undefined);

  const isHost = myTeams.includes(match.host_team_name);
  const isAway = match.away_team_name ? myTeams.includes(match.away_team_name) : false;
  const myApp = myApplications.find((app) => app.match_id === match.id);
  const myMercenaryApp = myApplications.find(
    (app) => app.match_id === match.id && app.applicant_user_id === currentUserId && app.application_type === 'mercenary'
  );
  const isMyMatch = isHost || isAway;

  const isCompleted = match.status === 'completed';
  const isFriendly = match.status === 'friendly';
  const isPending = match.status === 'pending_result';
  const isMatched = match.status === 'matched';
  const isOpen = match.status === 'open';

  const isBothTeams = isHost && isAway;
  const submitterIsMyHostTeam = match.result_submitter_team === match.host_team_name;
  const submitterIsMyAwayTeam = match.result_submitter_team === match.away_team_name;

  const canApprove = isBothTeams
    ? true
    : (isHost && submitterIsMyAwayTeam) || (isAway && submitterIsMyHostTeam);

  const availableNonHostTeams = myTeams.filter((t) => t !== match.host_team_name);
  const isMercenaryExpanded = expandedMercenaryMatchIds.includes(match.id);

  return (
    <View style={styles.matchCard}>
      <View style={styles.cardMetaRow}>
        <View style={styles.regionTagPill}>
          <Text style={styles.regionTagPillText}>📍 {match.region || '천안'}</Text>
        </View>

        <View style={styles.badgeRightGroup}>
          {match.need_mercenary && (
            <TouchableOpacity
              style={styles.mercenaryBadge}
              onPress={() => onToggleMercenaryDetails(match.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.mercenaryBadgeText}>
                🙋‍♂️ 용병 구함 {isMercenaryExpanded ? '▴' : '▾'}
              </Text>
            </TouchableOpacity>
          )}
          <View
            style={[
              styles.statusBadge,
              isCompleted
                ? styles.statusCompleted
                : isFriendly
                ? styles.statusFriendly
                : isPending
                ? styles.statusPending
                : isMatched
                ? styles.statusMatched
                : styles.statusOpen,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isCompleted
                  ? styles.statusTextCompleted
                  : isFriendly
                  ? styles.statusTextFriendly
                  : isPending
                  ? styles.statusTextPending
                  : isMatched
                  ? styles.statusTextMatched
                  : styles.statusTextOpen,
              ]}
            >
              {isCompleted
                ? '공식종료'
                : isFriendly
                ? '친선종료'
                : isPending
                ? '결과확인중'
                : isMatched
                ? '매칭완료'
                : '모집중'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.scoreboardRow}>
        <View style={styles.teamColLeft}>
          <Text style={styles.hostTeamText} numberOfLines={1}>
            {displayTeamName(match.host_team_name)}
          </Text>
          <Text style={styles.teamRoleLabel}>주최팀</Text>
        </View>

        <View style={styles.vsPill}>
          <Text style={styles.vsPillText}>VS</Text>
        </View>

        <View style={styles.teamColRight}>
          <Text style={[styles.awayTeamText, !match.away_team_name && styles.textMuted]} numberOfLines={1}>
            {match.away_team_name ? displayTeamName(match.away_team_name) : '상대 모집중'}
          </Text>
          <Text style={styles.teamRoleLabel}>상대팀</Text>
        </View>
      </View>

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

      {(isOpen || isMatched || isPending || isMyMatch) && (
        <TouchableOpacity
          style={styles.scoreboardLiveBtn}
          onPress={() => router.push({ pathname: '/scoreboard', params: { matchId: match.id } })}
          activeOpacity={0.85}
        >
          <Text style={styles.scoreboardLiveBtnText}>
            📊 {isOpen ? '스코어보드 눌러보기 (연습용)' : '실시간 전광판 스코어보드 진입 ▶'}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.commentBarBtn}
        onPress={() => onOpenCommentModal(match)}
        activeOpacity={0.85}
      >
        <Text style={styles.commentBarBtnText}>💬 소통 / 질문 댓글방 열기</Text>
      </TouchableOpacity>

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
        <View style={{ marginTop: 10, gap: 6 }}>
          {match.host_youtube_url ? (
            <TouchableOpacity style={styles.youtubeBarBtn} onPress={() => onOpenYoutube(match.host_youtube_url!)}>
              <Text style={styles.youtubeBarBtnText}>🎥 [{displayTeamName(match.host_team_name)}] 영상 보기 ▶</Text>
            </TouchableOpacity>
          ) : null}
          {match.away_youtube_url ? (
            <TouchableOpacity
              style={[styles.youtubeBarBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
              onPress={() => onOpenYoutube(match.away_youtube_url!)}
            >
              <Text style={[styles.youtubeBarBtnText, { color: '#1D4ED8' }]}>
                🎥 [{match.away_team_name ? displayTeamName(match.away_team_name) : '상대팀'}] 영상 보기 ▶
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* 💡 경기 결과 분석 리포트 버튼 (종료/결과확인중/세트점수 기록 존재 시 노출) */}
      {(isCompleted || isFriendly || isPending || !!match.set_scores) && onOpenReportModal && (
        <TouchableOpacity
          style={styles.reportBarBtn}
          onPress={() => onOpenReportModal(match)}
          activeOpacity={0.85}
        >
          <Text style={styles.reportBarBtnText}>📊 경기 결과 분석 리포트 보기 ›</Text>
        </TouchableOpacity>
      )}

      <View style={{ marginTop: 12 }}>
        {isCompleted && (
          <View style={{ gap: 8 }}>
            <View style={styles.completedBanner}>
              <Text style={styles.completedBannerText}>
                🏆 전적: {match.winner_team === 'draw' ? '무승부' : `${match.winner_team} 승리!`}
              </Text>
              {match.set_scores ? <Text style={styles.setScoreText}>📊 세트 스코어: {match.set_scores}</Text> : null}
              {match.approved_by_name && (
                <Text style={styles.auditSubText}>(최종 확정: {match.approved_by_name} 선생님 승인)</Text>
              )}
            </View>

            {isMyMatch && (
              <View style={{ gap: 6 }}>
                <TouchableOpacity
                  style={styles.evaluationBtn}
                  onPress={() => onOpenEvaluationModal(match)}
                  disabled={actionLoading}
                >
                  <Text style={styles.evaluationBtnText}>🎁 상대팀 매너 평가 & 칭찬 포도알 보내기</Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={[styles.resultBtn, { backgroundColor: '#475569' }]}
                    onPress={() => onOpenResultModal(match)}
                  >
                    <Text style={styles.resultBtnText}>✏️ 결과 재수정</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.resultBtn, { backgroundColor: '#0284C7' }]}
                    onPress={() => onOpenRosterOnlyModal(match)}
                  >
                    <Text style={styles.resultBtnText}>👥 명단 수정</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {isFriendly && (
          <View style={{ gap: 8 }}>
            <View style={[styles.completedBanner, { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' }]}>
              <Text style={[styles.completedBannerText, { color: '#64748B' }]}>
                🤝 친선: {match.winner_team === 'draw' ? '무승부' : `${match.winner_team} 승리!`}
              </Text>
              {match.set_scores ? <Text style={styles.setScoreText}>📊 세트 스코어: {match.set_scores}</Text> : null}
            </View>

            {isMyMatch && (
              <View style={{ gap: 6 }}>
                <TouchableOpacity
                  style={styles.evaluationBtn}
                  onPress={() => onOpenEvaluationModal(match)}
                  disabled={actionLoading}
                >
                  <Text style={styles.evaluationBtnText}>🎁 상대팀 매너 평가 & 칭찬 포도알 보내기</Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={[styles.resultBtn, { backgroundColor: '#475569' }]}
                    onPress={() => onOpenResultModal(match)}
                  >
                    <Text style={styles.resultBtnText}>✏️ 친선 결과 재수정</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.resultBtn, { backgroundColor: '#0284C7' }]}
                    onPress={() => onOpenRosterOnlyModal(match)}
                  >
                    <Text style={styles.resultBtnText}>👥 명단 수정</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {isPending && (
          <View style={{ gap: 8 }}>
            <View style={styles.pendingBanner}>
              <Text style={styles.pendingBannerText}>
                제출 결과: {match.winner_team === 'draw' ? '무승부' : `'${match.winner_team}' 승리`}
                {match.set_scores ? ` (${match.set_scores})` : ''}
              </Text>
              {match.submitted_by_name && (
                <Text style={styles.auditSubText}>
                  (제출자: {match.submitted_by_name} 선생님 ➔ 상대팀 승인 대기)
                </Text>
              )}
            </View>

            {canApprove ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={[styles.resultBtn, { flex: 1.2, backgroundColor: '#10B981' }]}
                  onPress={() => onApproveResult(match, true)}
                >
                  <Text style={styles.resultBtnText}>✅ 승인</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.resultBtn, { flex: 1.2, backgroundColor: '#3B82F6' }]}
                  onPress={() => onOpenResultModal(match)}
                >
                  <Text style={styles.resultBtnText}>✏️ 수정 제출</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cancelAppBtn, { flex: 1, paddingVertical: 12 }]}
                  onPress={() => onApproveResult(match, false)}
                >
                  <Text style={styles.cancelAppBtnText}>❌ 거절</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.pendingWaitText}>⏳ 상대팀 승인 대기 중입니다</Text>
            )}
          </View>
        )}

        {isMatched && (
          <View style={{ gap: 8 }}>
            <View style={styles.matchedBanner}>
              <Text style={styles.matchedBannerText}>🎉 매칭 완료! 경기가 끝나면 스코어를 등록해 주세요.</Text>
            </View>
            {isMyMatch && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity style={styles.resultBtn} onPress={() => onOpenResultModal(match)}>
                  <Text style={styles.resultBtnText}>🏆 결과 등록</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.resultBtn, { backgroundColor: '#0284C7' }]}
                  onPress={() => onOpenRosterOnlyModal(match)}
                >
                  <Text style={styles.resultBtnText}>👥 명단 수정</Text>
                </TouchableOpacity>
              </View>
            )}
            {isAway && (
              <TouchableOpacity style={styles.cancelAppBtn} onPress={() => onCancelApplication(match)}>
                <Text style={styles.cancelAppBtnText}>🚨 매칭 취소</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {isOpen && (
          <View style={{ gap: 8 }}>
            {isHost && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={styles.hostManageBtn} onPress={() => onOpenApplicantModal(match)}>
                  <Text style={styles.hostManageBtnText}>📋 신청 현황 / 승인</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => onDeleteMatch(match)}>
                  <Text style={styles.deleteBtnText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            )}

            {!isHost && match.need_mercenary && (
              myMercenaryApp ? (
                <View style={styles.appliedRow}>
                  <View style={[styles.appliedBadge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                    <Text style={[styles.appliedBadgeText, { color: '#B45309' }]}>🙋‍♂️ 용병 신청 완료</Text>
                  </View>
                  <TouchableOpacity style={styles.cancelAppBtn} onPress={() => onCancelApplication(match)}>
                    <Text style={styles.cancelAppBtnText}>취소</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.applyMercenaryBtn} onPress={() => onOpenMercenaryModal(match)}>
                  <Text style={styles.applyMercenaryBtnText}>🙋‍♂️ 용병(게스트) 신청하기</Text>
                </TouchableOpacity>
              )
            )}

            {myApp && myApp.application_type !== 'mercenary' ? (
              <View style={styles.appliedRow}>
                <View style={styles.appliedBadge}>
                  <Text style={styles.appliedBadgeText}>✅ 팀 신청 완료 ({myApp.applicant_team_name})</Text>
                </View>
                <TouchableOpacity style={styles.cancelAppBtn} onPress={() => onCancelApplication(match)}>
                  <Text style={styles.cancelAppBtnText}>취소</Text>
                </TouchableOpacity>
              </View>
            ) : (
              availableNonHostTeams.length > 0 && (
                <TouchableOpacity style={styles.applyBtn} onPress={() => onApplyMatch(match)}>
                  <Text style={styles.applyBtnText}>
                    {isHost ? '✨ 다른 팀으로 참가 신청' : '🛡️ 팀 단위 참가 신청'}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  matchCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4 },
  cardMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  regionTagPill: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  regionTagPillText: { fontSize: 11, fontWeight: '800', color: '#475569' },
  badgeRightGroup: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  scoreboardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 10 },
  teamColLeft: { flex: 1, alignItems: 'flex-start' },
  teamColRight: { flex: 1, alignItems: 'flex-end' },
  hostTeamText: { fontSize: 16, fontWeight: '900', color: Colors.primary },
  awayTeamText: { fontSize: 16, fontWeight: '900', color: '#0284C7' },
  teamRoleLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginTop: 2 },
  vsPill: { backgroundColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginHorizontal: 8 },
  vsPillText: { fontSize: 11, fontWeight: '900', color: '#64748B' },
  textMuted: { color: '#94A3B8', fontSize: 14, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  statusOpen: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  statusMatched: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  statusPending: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  statusFriendly: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
  statusCompleted: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
  statusText: { fontSize: 11, fontWeight: '800' },
  statusTextOpen: { color: '#166534' },
  statusTextMatched: { color: '#1D4ED8' },
  statusTextPending: { color: '#B45309' },
  statusTextFriendly: { color: '#64748B' },
  statusTextCompleted: { color: '#334155' },
  mercenaryBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#FDE68A' },
  mercenaryBadgeText: { fontSize: 11, fontWeight: '800', color: '#B45309' },
  mercenaryInfoBox: { backgroundColor: '#FEFCE8', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 10 },
  mercenaryInfoTitle: { fontSize: 11, fontWeight: '800', color: '#B45309' },
  mercenaryInfoText: { fontSize: 12, color: '#92400E', fontWeight: '700', marginTop: 2 },
  matchDetailsBox: { gap: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailIcon: { fontSize: 13 },
  detailText: { fontSize: 13, color: '#334155', fontWeight: '600' },
  scoreboardLiveBtn: { backgroundColor: '#0F172A', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  scoreboardLiveBtnText: { color: '#38BDF8', fontSize: 12.5, fontWeight: '900' },
  commentBarBtn: { backgroundColor: '#F8FAFC', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 6, borderWidth: 1, borderColor: '#CBD5E1' },
  commentBarBtnText: { color: '#475569', fontSize: 12.5, fontWeight: '800' },
  rosterAuditBox: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#EFF6FF', borderRadius: 6, borderWidth: 1, borderColor: '#BFDBFE' },
  rosterAuditText: { fontSize: 10.5, fontWeight: '800', color: '#1D4ED8' },
  descriptionBox: { marginTop: 8, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: '#93C5FD' },
  descriptionText: { fontSize: 12.5, color: '#64748B', fontStyle: 'italic', lineHeight: 18 },
  youtubeBarBtn: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  youtubeBarBtnText: { color: '#DC2626', fontSize: 12, fontWeight: '800' },

  reportBarBtn: { backgroundColor: '#FEFCE8', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: '#FDE047' },
  reportBarBtnText: { color: '#A16207', fontSize: 12.5, fontWeight: '900' },

  hostManageBtn: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1' },
  hostManageBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '800' },
  deleteBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: '#FCA5A5', justifyContent: 'center', alignItems: 'center' },
  deleteBtnText: { color: '#DC2626', fontSize: 13, fontWeight: '800' },
  resultBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center', flex: 1 },
  resultBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  applyBtn: { backgroundColor: '#0EA5E9', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  applyBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  applyMercenaryBtn: { backgroundColor: '#D97706', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  applyMercenaryBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  appliedRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  appliedBadge: { flex: 1, backgroundColor: '#F0FDF4', borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: '#BBF7D0' },
  appliedBadgeText: { color: '#15803D', fontSize: 13, fontWeight: '800' },
  cancelAppBtn: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cancelAppBtnText: { color: '#DC2626', fontSize: 13, fontWeight: '800' },
  matchedBanner: { backgroundColor: '#EFF6FF', padding: 10, borderRadius: 8, alignItems: 'center' },
  matchedBannerText: { color: '#1E40AF', fontSize: 12.5, fontWeight: '800' },
  completedBanner: { backgroundColor: '#F1F5F9', padding: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  completedBannerText: { color: '#0F172A', fontSize: 14, fontWeight: '900' },
  setScoreText: { fontSize: 13, fontWeight: '800', color: '#2563EB', marginTop: 2 },
  auditSubText: { fontSize: 10.5, color: '#64748B', fontWeight: '700', marginTop: 2 },
  pendingBanner: { backgroundColor: '#FEFCE8', padding: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#FEF08A' },
  pendingBannerText: { color: '#A16207', fontSize: 13, fontWeight: '800' },
  pendingWaitText: { textAlign: 'center', marginTop: 2, color: '#64748B', fontSize: 12.5, fontWeight: '800' },
  evaluationBtn: { backgroundColor: '#9333EA', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 6 },
  evaluationBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});