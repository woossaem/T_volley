export const Colors = {
  primary: '#1E3A5F',
  primaryLight: '#2563EB',
  secondary: '#F97316',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#334155',
  textMuted: '#64748B',
  success: '#22C55E',
  error: '#EF4444',
  warning: '#F59E0B',
  border: '#E2E8F0',
} as const;

/** A팀(홈)=파랑, B팀(어웨이)=빨강. 전광판 바탕과 득점 모달이 같은 값을 쓴다. */
export const TEAM_COLORS = {
  host: '#1D4ED8',
  away: '#B91C1C',
} as const;
