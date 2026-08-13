export interface SeasonInfo {
    year: number;
    seasonCode: 'S/S' | 'F/W';
    seasonName: '상반기' | '하반기';
    fullLabel: string;
    periodCode: string;
    half: 1 | 2;
  }
  
  export const getCurrentSeasonInfo = (baseDate: Date = new Date()): SeasonInfo => {
    const currentYear = baseDate.getFullYear();
    const month = baseDate.getMonth() + 1; // 8월 = 8
  
    // 2월 1일 ~ 7월 31일: S/S 시즌 (상반기)
    if (month >= 2 && month <= 7) {
      return {
        year: currentYear,
        seasonCode: 'S/S',
        seasonName: '상반기',
        fullLabel: `📅 ${currentYear} 상반기 시즌`,
        periodCode: `${currentYear}_1`,
        half: 1,
      };
    }
  
    // 8월 1일 ~ 내년 1월 31일: F/W 시즌 (하반기)
    const seasonYear = month === 1 ? currentYear - 1 : currentYear;
  
    return {
      year: seasonYear,
      seasonCode: 'F/W',
      seasonName: '하반기',
      fullLabel: `📅 ${seasonYear} 하반기 시즌`,
      periodCode: `${seasonYear}_2`,
      half: 2,
    };
  };
  
  export const getSeasonOptions = () => {
    const current = getCurrentSeasonInfo();
    const y = current.year;
  
    return [
      { id: 'hall_of_fame', label: '🏛️ 명예의 전당 (역대 통산)', year: 0, half: 0 },
      { id: `${y}_2`, label: `📅 ${y} 하반기 시즌 (F/W)`, year: y, half: 2 },
      { id: `${y}_1`, label: `📅 ${y} 상반기 시즌 (S/S)`, year: y, half: 1 },
      { id: `${y - 1}_2`, label: `📅 ${y - 1} 하반기 시즌 (F/W)`, year: y - 1, half: 2 },
      { id: `${y - 1}_1`, label: `📅 ${y - 1} 상반기 시즌 (S/S)`, year: y - 1, half: 1 },
    ];
  };