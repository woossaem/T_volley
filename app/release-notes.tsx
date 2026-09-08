import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';
import { getCurrentSeasonInfo } from '../lib/season';
import { APP_VERSION_FULL } from '../constants/Version';

const currentSeason = getCurrentSeasonInfo();

const RELEASE_LOGS = [
  {
    version: APP_VERSION_FULL,
    date: '2026.09.08',
    title: '🛡️ 이름·팀명이 빠지지 않고, 게스트 팀 경기와 아이폰 전광판이 안정해졌어요',
    changes: [
      '👤 [이름·팀명 빈칸 방어] 닉네임·실명·이메일 중 있는 값으로 선수 이름을 보여 주고, 팀명도 비어 있으면 동호회팀/게스트 팀으로 채웁니다. 오스타·김요한 선생님처럼 특정 기록이 안 보이던 현상을 막았습니다.',
      '🤝 [미가입 게스트 팀과 경기] 아직 앱에 없는 팀과도 바로 경기를 만들고, 나중에 가입한 실제 팀을 지정하면 상대의 승인 또는 재수정을 거친 뒤에만 공식 랭킹에 올라갑니다.',
      '📊 [프로필 리포트 분리] 다른 선생님 프로필에서도 교류전/청백전을 나눠 볼 수 있고, 내 출전 성적과 같은 개인 분석 화면을 씁니다.',
      '📱 [아이폰 전광판 튕김 방지] 가로 화면으로 들어갈 때 진동·화면 고정이 실패해도 앱이 꺼지지 않고, 점수와 여백 숫자에 빈값이 들어가도 전광판이 열립니다. 9인제 포메이션·2탭 교체는 그대로입니다.',
      '🏐 [공식 앱 아이콘 스플래시] 시작 화면에 예전 배구공만 보이던 부분을 고쳐, 남색 배경과 파란 T가 있는 공식 아이콘이 그대로 뜹니다.',
      '🏟️ [공식전 팀 분석 개편] 어느 포메이션·로테이션에서 점수가 잘 나는지, 1세트와 2~3세트 승률 기복, 팀 전체 득점 성공/범실 비율을 보여 줍니다.',
      '⚔️ [청백전은 연습량으로] 승패·득실 대신 소화한 세트 수와 출석, 가장 많이 함께 뛴 듀오·트리오를 봅니다.',
      '🛡️ [기록 엔진은 그대로] 전광판 득점 로그와 저장 방식은 바꾸지 않고, 이름 표시와 리포트가 숫자를 읽어 보여 주는 방식만 정리했습니다.',
    ],
  },
  {
    version: `v2.0.5 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.09.06',
    title: '📊 프로필·랭킹이 더 정확해지고, 상세 분석이 풍성해졌어요',
    changes: [
      '🛡️ [랭킹은 교류전만] 전국 개인·팀 랭킹에는 다른 팀과의 공식 경기만 들어갑니다. 팀 안 연습경기(청백전)는 제외됩니다.',
      '🥇 [세트 승으로 보기 쉽게] 개인 다승은 ‘5세트 승 (8세트 출전)’처럼 세트 기준으로 보여 경기 승수와 헷갈리지 않습니다.',
      '🩺 [빠진 출전 기록 복구] 라인업이 비어 있어도 득점 기록이 있으면 출전·승률·짝꿍이 정상적으로 집계됩니다.',
      '⚔️ [청백전은 따로 보기] 교류전 기록이 없어도 빈 화면 대신, 분석 리포트에서 청백전 탭으로 연습 기록을 확인할 수 있습니다.',
      '📈 [한눈에 보는 코트 습관] 득실 마진, 세트당 득점, 승부처 득점, 포지션별 출전·승률과 한 줄 칭호를 리포트에서 볼 수 있습니다.',
    ],
  },
  {
    version: `v2.0.4 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.09.06',
    title: '🎯 나중에 가입해도 예전 기록이 따라오고, 점수가 더 잘 맞아요',
    changes: [
      '🔗 [나중에 가입해도 기록 이어짐] 아직 앱에 없는 선생님 자리로 남겨 둔 기록도, 나중에 가입하고 승인하면 그 성적에 붙습니다.',
      '🛡️ [상대 팀이 나중에 생겨도 공식 경기 인정] 아직 등록되지 않은 팀과 친선으로 치른 경기도, 그 팀이 가입하고 양쪽이 승인하면 공식 교류전으로 올라갑니다.',
      '🔄 [다음 세트 명단 자동 이어받기] 빠른 결과 입력 때 1세트 출전 명단이 2·3세트에도 그대로 이어져, 출전 기록이 빠지지 않습니다.',
      '📊 [득점만 있어도 출전으로 인정] 라인업을 미처 넣지 않아도, 득점 기록이 있으면 그 세트에 나온 것으로 인정됩니다.',
      '⚡ [점수 취소가 바로 반영] 타임라인에서 점수를 취소하거나 지우면 전광판과 기록이 바로 맞춰집니다.',
      '📱 [전광판 말투 정리] 현장 선생님에게 불필요한 안내 문구를 정리하고, 세트 마감 후 점수가 빠지지 않게 다듬었습니다.',
    ],
  },
  {
    version: `v2.0.3 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.31',
    title: '📱 전광판이 더 커지고, 코트 배치와 로그인이 편해졌어요',
    changes: [
      '🔒 [카카오·구글 로그인 안정화] 로그인 상태가 갑자기 풀리거나, 앱을 나갔다 들어올 때 튕기던 문제를 고쳤습니다.',
      '👤 [한글 실명으로 보이기] 구글·카카오 계정 이름 대신, 프로필에 적은 한글 성함과 소속 팀이 우선으로 보입니다.',
      '📊 [점수판을 더 크게] 위쪽 여백과 겹치는 세트 글자를 줄여, 체육관에서도 잘 보이도록 점수를 키웠습니다.',
      '🏐 [세로 네트 코트 보기] 가로로 들면 네트가 가운데 오고, 레프트·라이트·센터 자리가 좌우로 나란히 보입니다.',
      '🎯 [코트 터치로 득점·범실] 점수판을 누르면 코트 화면이 뜨고, 누른 자리의 선수 득점이나 상대 범실로 바로 들어갑니다.',
      '🗑️ [세트 삭제하면 번호도 정리] 세트를 지우면 기록이 함께 사라지고, 남은 세트가 1, 2, 3… 순서로 다시 맞춰집니다.',
      '🔄 [다음 세트 명단 이어받기] 직전 세트 마지막 출전 명단이 다음 세트로 이어지고, 대기 인원이 많아도 편하게 넘길 수 있습니다.',
      '🤝 [기록자별 교체 권한] 청백전에서는 양쪽 교체가 가능하고, 교류전에서는 상대 팀 배치는 보이되 함부로 바꾸지 못합니다.',
      '🛡️ [무승부 세트도 점수 유지] 무승부로 끝난 세트의 점수 칸이 비지 않고, 빠진 세트 점수도 알아서 다시 맞춥니다.',
      '🥇 [개인 성적은 세트 기준] 경기 최종 승패와 따로, 내가 나온 세트의 승·패와 출전 세트 수를 따로 모읍니다.',
    ],
  },
  {
    version: `v2.0.2 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.18',
    title: '📊 경기 끝난 뒤 분석이 생기고, 청백전 기록이 더 정확해졌어요',
    changes: [
      '📊 [경기 결과 한눈에] 오늘의 득점왕, 승부처에서 빛난 선수, 연속 득점·실점 같은 재미있는 기록을 경기 후 리포트로 보여 줍니다.',
      '⚔️ [청백전 진행 중 상태 수정] 승패를 고르지 않았는데 무승부로 저장되던 문제를 고쳤습니다. 끝나지 않은 경기는 진행 중으로 남습니다.',
      '🏆 [경기 한 번에 종료] 세트만 닫는 것 외에, 경기 전체를 한 번에 마치고 상대 승인을 요청하거나 바로 확정할 수 있습니다.',
      '🥇 [청백전 개인 순위는 세트 기준] 경기 승패가 아니라, 나온 세트의 승수 → 승률 → 출전 세트 순으로 순위를 매깁니다.',
      '📢 [전광판은 광고 없이] 기록 중에는 전광판을 가리지 않고, 다른 화면과 팝업 아래에만 배너를 둡니다.',
      '🛡️ [동호회 팀명·연고지 정리] 팀 이름이 빠지거나 이상하게 보이던 문제를 고쳐, 랭킹과 프로필에 제대로 나옵니다.',
    ],
  },
  {
    version: `v2.0.1 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.17',
    title: '⚡ 전광판이 더 잘 보이고, 소통방이 안전해졌어요',
    changes: [
      '📊 [점수판을 위로, 더 크게] 큰 점수를 위쪽으로 옮기고, 가운데를 가리던 잠금·가림막을 없앴습니다.',
      '⚡ [점수가 바로 올라감] 서버를 기다리지 않고, 누르는 즉시 점수가 화면에 반영됩니다.',
      '📺 [양팀 타임라인] A팀·B팀 득점이 두 줄로 나뉘고, 새 득점이 생기면 가장 최근 칸으로 자동으로 내려갑니다.',
      '🏐 [코트에 있는 선수만] 득점이나 교체할 때, 지금 코트에 나와 있는 멤버만 보여 줍니다.',
      '👤 [한글 실명으로 기록] 구글·카카오 아이디 대신 프로필 한글 성함이 보이고, 누가 기록 중인지도 입장 전에 확인할 수 있습니다.',
      '🧼 [매칭되면 연습 점수 초기화] 모집 중에 눌러 둔 전광판 점수는, 매칭이 확정되면 0:0으로 깨끗이 리셋됩니다.',
      '📝 [최근 글 불러오기] 경기 등록 때 남긴 말과 대표 연락처를, 각각 최근에 쓴 내용으로 바로 불러올 수 있습니다.',
      '💬 [댓글 삭제·신고·차단] 내 댓글은 지울 수 있고, 상대 댓글은 신고하거나 차단할 수 있습니다. 소속 팀 이름도 뱃지로 보입니다.',
      '◀▶ [세트 이동과 요약] 위쪽 세트 탭으로 세트별 점수를 고치고, 화면이 흔들리지 않게 고정했습니다.',
    ],
  },
  {
    version: `v2.0.0 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.17',
    title: '🚀 개인 득점 기록과 커뮤니티 투표가 시작됐어요',
    changes: [
      '📊 [개인 득점 전광판] 9인제에 맞춰, 선수마다 득점을 남길 수 있는 기록 모드가 생겼습니다.',
      '🔄 [실시간 교체] 선수를 바꾸면 타임라인에도 바로 남고, 취소한 기록은 그어서 보여 줍니다.',
      '📱 [가로 전광판] 스코어보드에 들어가면 체육관 전광판처럼 가로 화면으로 자동 전환됩니다.',
      '🔒 [기록자 권한 자동 반납] 앱을 나가면 기록자 권한이 자동으로 풀려, 다른 선생님이 이어받을 수 있습니다.',
    ],
  },
  {
    version: `v1.6.3 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.16',
    title: '🗳️ 투표가 생기고, 경기마다 댓글로 이야기할 수 있어요',
    changes: [
      '🗳️ [세 가지 투표] 공식 투표, 팀 안 투표, 공개 투표 중 골라 설문할 수 있습니다.',
      '📅 [투표 형식] 글 선택, 날짜 고르기, 참석·불참·미정 중에서 골라 만들 수 있습니다.',
      '💬 [항목 추가 허용] 투표를 만들 때, 다른 선생님이 새 후보를 넣게 할지 막을지 정할 수 있습니다.',
      '🗣️ [경기 소통 댓글] 교류전·청백전마다 주차, 네트 높이 등을 미리 맞출 수 있는 댓글방이 열리고, 소속 뱃지가 붙습니다.',
      '🛡️ [공개 투표 제한] 공개 투표는 매너 온도 37.0°C 이상이고, 공식 교류전에 나와 본 선생님만 만들 수 있습니다.',
    ],
  },
  {
    version: `v1.6.2 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.15',
    title: '🔥 현장에서 바로 쓰는 실시간 전광판이 나왔어요',
    changes: [
      '📊 [현장 점수판] 스마트폰·태블릿으로 경기를 바로 기록할 수 있는 양팀 점수판이 생겼습니다.',
      '🔄 [코트 체인지] 세트가 바뀌거나 코트를 바꿀 때, 한 번 눌러 점수판 좌우를 뒤집습니다.',
      '🤝 [한 명 또는 두 명이 기록] 양쪽 기록자가 들어오면 상대 코트는 잠기고, 각자 자기 팀만 조작합니다.',
      '⏱️ [득점 흐름] 아래쪽에서 세트별 득점 흐름을 보고, 바로 직전 득점을 취소할 수 있습니다.',
      '✍️ [점수 직접 고치기] 타임라인에서 한 점을 지우거나, 큰 점수를 눌러 숫자를 직접 고칠 수 있습니다.',
      '🙋‍♂️ [누가 기록 중인지] 전광판 위에 지금 기록 중인 선생님 성함이 보입니다.',
      '🚀 [바로 전광판으로] 진행 중인 교류전이나 청백전에서 한 번에 전광판으로 들어갑니다.',
    ],
  },
  {
    version: `v1.6.1 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.15',
    title: '⚡ 팀 가입이 편해지고, 홈에서 진행 경기가 보여요',
    changes: [
      '🔓 [공개 팀은 바로 가입] 비밀번호 없는 공개 팀은 신청과 동시에 바로 들어갑니다.',
      '🔔 [가입 승인·거절] 팀 카드에서 신청한 선생님을 바로 받거나 거절할 수 있습니다.',
      '⏳ [신청 취소] 승인 기다리는 동안, 대기 버튼을 눌러 신청을 취소할 수 있습니다.',
      '🔴+💜 [홈 진행 경기] 홈 화면에서 공식 교류전(빨강)과 청백전(보라, 세트 점수)을 함께 볼 수 있습니다.',
      '🎯 [알림 누르면 바로 이동] 가입 요청, 교류전, 청백전 알림을 누르면 해당 화면으로 바로 갑니다.',
      '✍️ [한글 이름 입력 수정] 성함을 바꿀 때 자음·모음을 조합하는 중 글자가 지워지던 문제를 고쳤습니다.',
      '🔒 [카카오 로그인 안정화] 카카오 로그인 중 튕기던 현상을 줄였습니다.',
    ],
  },
  {
    version: `v1.6.0 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.12',
    title: '✨ 칭호 도감이 생기고, 교류전 카드가 새로워졌어요',
    changes: [
      '🏆 [칭호 도감] 모은 칭호를 보고, 프로필에 대표 칭호 2개를 골라 달 수 있습니다.',
      '🏟️ [교류전 카드] 경기 카드가 전광판처럼 점수와 팀이 한눈에 보이도록 바뀌었습니다.',
      '🔑 [가입 비밀번호 선택] 팀을 만들거나 관리할 때, 누구나 가입할지 비밀번호를 둘지 고를 수 있습니다.',
      '📍 [연고지 이름 정리] 충남 시·군과 주요 광역시 이름이 제각각이던 표기를 하나로 맞췄습니다.',
      '🎁 [매너 평가와 포도알] 상대 팀 매너를 평가하고 칭찬 포도알을 보내는 기능이 더 안정적으로 동작합니다.',
    ],
  },
  {
    version: `v1.5.0 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.09',
    title: '🚀 시즌이 바뀌고, 현장 기록이 훨씬 빨라졌어요',
    changes: [
      `📅 [시즌 자동 전환] 8월 1일부터 [${currentSeason.fullLabel}]이 자동으로 적용됩니다.`,
      '🔴 [진행 중 경기 바로 열기] 지금 하고 있는 내 경기를 홈 맨 위에서 바로 열어 기록할 수 있습니다.',
      '🔀 [출전·벤치·미참석] 선수를 누르면 코트 출전 → 오늘 벤치 → 미참석 순으로 바뀝니다.',
      '📦 [나온 사람만 위로] 다음 세트에서는 체육관에 온 멤버만 위쪽에 모여, 교체가 수월합니다.',
      '🙋‍♂️ [지각 멤버 초성 검색] 늦게 온 선생님을 초성으로 찾아 코트나 벤치에 바로 넣을 수 있습니다.',
      '✍️ [명단 바로 수정] 상대 승인 없이 출전 명단을 바로 고치고, 누가 수정했는지도 남습니다.',
      '🍇 [포도알과 매너 온도] 매너 평가를 한 번에 하면 포도알 1개가 바로 쌓이고, 누가 줬는지는 보이지 않습니다.',
      '✉️ [여러 팀에 한 번에 제안] 팀 목록에서 관심 있는 여러 팀을 골라 교류전 제안을 한꺼번에 보낼 수 있습니다.',
      '🏆 [경기 종류별 통계] 일반 교류전, 대회·리그전, 팀 안 연습경기 성적이 따로 모입니다.',
      '🛡️ [인터넷이 끊겨도 안심] 와이파이가 끊겨도 세트 점수는 휴대폰에 잠시 안전하게 보관됩니다.',
    ],
  },
  {
    version: 'v1.0.0 (2026 S/S)',
    date: '2026.08.01',
    title: '🎉 티볼리 정식 출시',
    changes: [
      '✨ 성함, 소속 학교, 활동 지역을 설정할 수 있습니다.',
      '🏫 학교 팀과 동호회 팀을 나누고, 대표 팀을 고를 수 있습니다.',
      '🏆 팀 전체 성적과, 내가 실제로 나온 성적을 따로 볼 수 있습니다.',
      '📊 시즌 랭킹과 명예의 전당을 승점 순으로 볼 수 있습니다.',
      '🔑 팀마다 가입 비밀번호를 바꾸고, 안내 팝업으로 알려 줍니다.',
      '📜 예전에 치른 경기나 친선 경기도 나중에 기록할 수 있습니다.',
    ],
  },
];

export default function ReleaseNotesScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>업데이트 소식</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introBox}>
          <Text style={styles.introTitle}>🛠️ 티볼리가 이렇게 바뀌었어요</Text>
          <Text style={styles.introSub}>
            선생님들이 현장에서 더 편하게 배구할 수 있도록, 기능을 꾸준히 더하고 다듬고 있습니다.
          </Text>
        </View>

        {RELEASE_LOGS.map((log, index) => (
          <View key={log.version} style={[styles.logCard, index === 0 && styles.latestCard]}>
            <View style={styles.logHeader}>
              <View style={styles.versionBadge}>
                <Text style={styles.versionText}>{log.version}</Text>
              </View>
              <Text style={styles.dateText}>{log.date}</Text>
            </View>

            <Text style={styles.logTitle}>{log.title}</Text>

            <View style={styles.changeList}>
              {log.changes.map((item, idx) => (
                <Text key={idx} style={styles.changeItem}>
                  • {item}
                </Text>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.developerBox}>
          <Text style={styles.developerText}>Designed & Developed by</Text>
          <Text style={styles.signatureText}>Rudolfuu</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 32, color: Colors.text, lineHeight: 32 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  content: {
    padding: 20,
    paddingBottom: 60, // 💡 하단 툴바/시스템바 가림 방지를 위해 여백 확장 (끝까지 시원하게 스크롤됨)
    gap: 16,
  },
  introBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  introTitle: { fontSize: 16, fontWeight: '800', color: '#1E40AF', marginBottom: 4 },
  introSub: { fontSize: 13, color: '#1E3A8A', lineHeight: 18 },
  logCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  latestCard: {
    borderColor: '#3B82F6',
    borderWidth: 1.5,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  versionBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  versionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  dateText: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  logTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  changeList: { gap: 6 },
  changeItem: { fontSize: 13, color: '#334155', lineHeight: 20, fontWeight: '500' },
  developerBox: {
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 16,
  },
  developerText: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  signatureText: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: 2,
    marginTop: 2,
  },
});