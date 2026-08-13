// lib/badgeUtils.ts

export interface BadgeStats {
    wins?: number;
    losses?: number;
    draws?: number;
    total?: number;
    recent5?: string[];
    winRate?: number;
  }
  
  export interface ActivityStats {
    recordCount?: number;
    praiseCount?: number;
  }
  
  export interface GetBadgeParams {
    stats: BadgeStats;
    userActivityStats?: ActivityStats;
    invitedCount?: number;
    gender?: string;
  }
  
  export interface BadgeItem {
    id: string;
    label: string;
    category: 'special' | 'meme' | 'stat' | 'basic';
    style: {
      backgroundColor: string;
      borderColor: string;
      color: string;
    };
    description: string;
    conditionText: string;
    isUnlocked: boolean;
  }
  
  // 💡 전체 칭호 마스터 리스트 & 해금 조건 판별 함수
  export const getAllBadgesWithStatus = ({
    stats,
    userActivityStats,
    invitedCount = 0,
    gender = '남성',
  }: GetBadgeParams): BadgeItem[] => {
    const wins = stats.wins ?? 0;
    const losses = stats.losses ?? 0;
    const draws = stats.draws ?? 0;
    const total = stats.total ?? 0;
    const recent5 = stats.recent5 ?? [];
    const winRate = stats.winRate ?? 0;
  
    const recordCount = userActivityStats?.recordCount ?? 0;
    const praiseCount = userActivityStats?.praiseCount ?? 0;
    const currentYear = new Date().getFullYear();
  
    // 조건 판별 변수들
    const recentWinStreak = recent5.length === 5 && recent5.every((res) => res === 'WIN');
    const isSupernova = total >= 3 && total <= 10 && winRate >= 75;
    const isTrueFairy = total >= 3 && total <= 5 && winRate === 100;
    const isPacifist = draws >= 3 && draws > wins && draws > losses;
  
    // TODO: 추후 확장 데이터 연동 시 true로 변환될 항목들
    const setWinRate = 0;
    const isBoyBreadwinner = total >= 5 && winRate <= 30 && setWinRate >= 75;
    const isCoachAn = false;
    const isSeasonKing = false;
    const isGukGeobak = false;
    const isGiantKiller = false;
    const isStrongKiller = false;
    const isDuelist = false;
    const isAllRounder = false;
    const isProMercenary = false;
    const isIdeaBank = false;
  
    return [
      // 🏆 1. Special & Season
      {
        id: 'season_king',
        label: `👑 ${currentYear}의 ${gender === '여성' ? '여왕' : '왕'}`,
        category: 'special',
        style: { backgroundColor: '#FFFBEB', borderColor: '#F59E0B', color: '#B45309' },
        description: `해당 시즌(${currentYear}년) 남/녀 전체 다승 1위를 차지한 독보적인 에이스입니다!`,
        conditionText: `시즌 남/녀 개인 다승 1위 달성`,
        isUnlocked: isSeasonKing,
      },
      {
        id: 'idea_bank',
        label: '💡 아이디어 뱅크',
        category: 'special',
        style: { backgroundColor: '#FEFCE8', borderColor: '#FDE047', color: '#A16207' },
        description: '티볼리 오류 제보 및 신규 아이디어가 3회 이상 채택된 감사한 유저입니다.',
        conditionText: '건의/아이디어 채택 3회 이상',
        isUnlocked: isIdeaBank,
      },
  
      // 🎭 2. Meme & Fun
      {
        id: 'win_streak_5',
        label: '🔥 폼 미쳤다 (5연승)',
        category: 'meme',
        style: { backgroundColor: '#FEF2F2', borderColor: '#EF4444', color: '#B91C1C' },
        description: '최근 공식 5경기 연속 승리를 거두며 파죽지세의 기량을 과시 중입니다!',
        conditionText: '최근 공식 5경기 전승 달성',
        isUnlocked: recentWinStreak,
      },
      {
        id: 'supernova',
        label: '☄️ 코트의 초신성',
        category: 'meme',
        style: { backgroundColor: '#F0FDF4', borderColor: '#22C55E', color: '#15803D' },
        description: '가입 초기(3~10전)부터 승률 75% 이상을 찍으며 코트를 흔드는 대형 신인입니다.',
        conditionText: '3~10전 달성 시 승률 75% 이상',
        isUnlocked: isSupernova,
      },
      {
        id: 'true_fairy',
        label: '🧚‍♂️ 찐 승리요정',
        category: 'meme',
        style: { backgroundColor: '#F0FDF4', borderColor: '#4ADE80', color: '#166534' },
        description: '출전 경기 수는 적지만(3~5전), 나타나기만 하면 100% 승리를 가져옵니다!',
        conditionText: '3~5전 달성 시 승률 100%',
        isUnlocked: isTrueFairy,
      },
      {
        id: 'boy_breadwinner',
        label: '😭 눈물의 소년가장',
        category: 'meme',
        style: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1', color: '#475569' },
        description: '팀 경기는 패배해도, 자신이 출전한 세트만큼은 75% 이상의 승률을 지켜내는 에이스입니다.',
        conditionText: '경기 승률 30% 이하 & 출전 세트 승률 75% 이상',
        isUnlocked: isBoyBreadwinner,
      },
      {
        id: 'pacifist',
        label: '🕊️ 평화주의자',
        category: 'meme',
        style: { backgroundColor: '#FDF4FF', borderColor: '#E879F9', color: '#86198F' },
        description: '승패를 넘어 화합을 추구하며 무승부 기록을 3회 이상 보유한 유저입니다.',
        conditionText: '무승부 3회 이상 (승/패보다 많음)',
        isUnlocked: isPacifist,
      },
      {
        id: 'gukgeobak',
        label: '🏠 국거박(내전깡패)',
        category: 'meme',
        style: { backgroundColor: '#F8FAFC', borderColor: '#94A3B8', color: '#334155' },
        description: '팀 내전 스코어는 압도적이지만 공식 교류전 출전은 아끼는 내전의 지배자입니다.',
        conditionText: '팀 내전 10승 이상 & 공식전 3승 이하',
        isUnlocked: isGukGeobak,
      },
      {
        id: 'coach_an',
        label: '👓 안감독님',
        category: 'meme',
        style: { backgroundColor: '#F8FAFC', borderColor: '#94A3B8', color: '#334155' },
        description: '팀 승률은 높지만 벤치에서 코칭하며 팀원들을 이끄는 명장입니다.',
        conditionText: '팀 승률 70% 이상 & 벤치 체류 비율 70% 이상',
        isUnlocked: isCoachAn,
      },
  
      // 🎖️ 3. Activity & Stats
      {
        id: 'volleyball_master',
        label: '🌟 배구 마스터',
        category: 'stat',
        style: { backgroundColor: '#FDF4FF', borderColor: '#D8B4FE', color: '#9333EA' },
        description: '통산 30승 이상을 달성한 티볼리 코트의 살아있는 전설입니다.',
        conditionText: '공식전 통산 30승 달성',
        isUnlocked: wins >= 30,
      },
      {
        id: 'victory_avatar',
        label: '👑 승리의 화신',
        category: 'stat',
        style: { backgroundColor: '#FEFCE8', borderColor: '#FDE047', color: '#B45309' },
        description: '통산 15승 이상을 기록하며 팀의 승리를 주도하는 승리 보증 수표입니다.',
        conditionText: '공식전 통산 15승 달성',
        isUnlocked: wins >= 15,
      },
      {
        id: 'victory_collector',
        label: '✌️ 승리 콜렉터',
        category: 'stat',
        style: { backgroundColor: '#FEFCE8', borderColor: '#FDE047', color: '#B45309' },
        description: '통산 5승 이상을 달성하며 본격적으로 승리의 맛을 붙여가는 선수입니다.',
        conditionText: '공식전 통산 5승 달성',
        isUnlocked: wins >= 5,
      },
      {
        id: 'grape_fairy',
        label: '🍇 칭찬 요정',
        category: 'stat',
        style: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A', color: '#B45309' },
        description: '상대 팀으로부터 포도알 칭찬을 10개 이상 받은 모범 매너 선수입니다.',
        conditionText: '매너 칭찬 포도알 10개 이상 수집',
        isUnlocked: praiseCount >= 10,
      },
      {
        id: 'honor_recorder',
        label: '✍️ 명예 기록관',
        category: 'stat',
        style: { backgroundColor: '#EFF6FF', borderColor: '#93C5FD', color: '#1D4ED8' },
        description: '경기 결과 등록 및 기록 작성을 5회 이상 전담해 준 고마운 유저입니다.',
        conditionText: '경기 결과 등록 5회 이상',
        isUnlocked: recordCount >= 5,
      },
      {
        id: 'tvolley_messenger',
        label: '📣 티볼리 전령',
        category: 'stat',
        style: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', color: '#166534' },
        description: '동료 교사 3명 이상을 초대하여 네트워크를 넓혀준 홍보대사입니다.',
        conditionText: '초대 코드로 3명 이상 가입',
        isUnlocked: invitedCount >= 3,
      },
      {
        id: 'volleyball_addict',
        label: '🔋 배구 중독자',
        category: 'stat',
        style: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', color: '#B91C1C' },
        description: '통산 20경기 이상 출전하며 주말마다 코트 위를 쉬지 않고 누비는 매니아입니다.',
        conditionText: '공식전 통산 20경기 이상 출전',
        isUnlocked: total >= 20,
      },
      {
        id: 'court_veteran',
        label: '🔥 코트의 베테랑',
        category: 'stat',
        style: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', color: '#475569' },
        description: '통산 10경기 이상을 치르며 노련한 경기 경험과 노하우를 쌓은 선수입니다.',
        conditionText: '공식전 통산 10경기 이상 출전',
        isUnlocked: total >= 10,
      },
      {
        id: 'volleyball_rookie',
        label: '🌱 배구 루키',
        category: 'stat',
        style: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0', color: '#64748B' },
        description: '티볼리 공식 매치에 첫발을 내딛고 첫 경기를 멋지게 소화해 낸 신입 선수입니다.',
        conditionText: '공식전 통산 1경기 이상 출전',
        isUnlocked: total >= 1,
      },
  
      // 🐣 4. Basic
      {
        id: 'volleyball_chick',
        label: '🐣 배구 병아리',
        category: 'basic',
        style: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0', color: '#94A3B8' },
        description: '아직 공식 매치 출전 기록이 없는 귀여운 티볼리 배구 새싹입니다.',
        conditionText: '가입 즉시 기본 해금',
        isUnlocked: true, // 기본 해금
      },
    ];
  };
  
  // 💡 대표 칭호 미선택 시 자동 우선순위 계산용 함수 (하위 호환)
  export const getUserTitleBadge = (params: GetBadgeParams): BadgeItem => {
    const allBadges = getAllBadgesWithStatus(params);
    // 해금된 칭호 중 가장 상위 목록 반환
    const unlocked = allBadges.filter((b) => b.isUnlocked);
    return unlocked.length > 0 ? unlocked[0] : allBadges[allBadges.length - 1];
  };