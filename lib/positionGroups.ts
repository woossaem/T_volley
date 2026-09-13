export type PositionGroup = 'attack' | 'control' | 'defense';

export type PositionGroupPalette = {
  bg: string;
  border: string;
  pos: string;
  name: string;
};

/** 전위·공격 / 볼 조율 / 후위·수비 */
export function positionGroupOf(label?: string | null): PositionGroup | null {
  const t = String(label || '');
  if (!t) return null;
  if (t.includes('레프트백') || t.includes('센터백') || t.includes('라이트백') || t.includes('세컨백') || t.includes('후위')) {
    return 'defense';
  }
  if (t.includes('세터') || t.includes('백차')) return 'control';
  if (t.includes('앞차') || t.includes('레프트') || t.includes('라이트') || t.includes('센터') || t.includes('전위') || t.includes('중위')) {
    return 'attack';
  }
  return null;
}

export const POSITION_GROUP_COLORS: Record<PositionGroup, PositionGroupPalette> = {
  attack: { bg: '#450A0A', border: '#7F1D1D', pos: '#FCA5A5', name: '#FFFFFF' },
  control: { bg: '#1E1B4B', border: '#312E81', pos: '#C7D2FE', name: '#FFFFFF' },
  defense: { bg: '#064E3B', border: '#115E59', pos: '#99F6E4', name: '#FFFFFF' },
};
