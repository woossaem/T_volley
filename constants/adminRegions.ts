import regionRows from './adminRegionData.json';

export type AdminRegion = {
  sido: string;
  district: string;
  label: string;
};

const SIDO_ALIASES: [string, string][] = [
  ['서울특별시', '서울'],
  ['부산광역시', '부산'],
  ['대구광역시', '대구'],
  ['인천광역시', '인천'],
  ['광주광역시', '광주'],
  ['대전광역시', '대전'],
  ['울산광역시', '울산'],
  ['세종특별자치시', '세종'],
  ['제주특별자치도', '제주'],
  ['강원특별자치도', '강원'],
  ['전북특별자치도', '전북'],
  ['충청남도', '충남'],
  ['충청북도', '충북'],
  ['전라남도', '전남'],
  ['전라북도', '전북'],
  ['경상남도', '경남'],
  ['경상북도', '경북'],
  ['경기도', '경기'],
  ['제주도', '제주'],
  ['강원도', '강원'],
];

const SIDO_NAMES = new Set([
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
]);

function toLabel(sido: string, district: string): string {
  if (sido === '세종') return '세종시';
  return `${sido} ${district}`;
}

export const ADMIN_REGIONS: AdminRegion[] = (regionRows as { sido: string; district: string }[]).map((row) => ({
  sido: row.sido,
  district: row.district,
  label: toLabel(row.sido, row.district),
}));

const LABEL_SET = new Set(ADMIN_REGIONS.map((row) => row.label));

export const QUICK_SCHOOL_REGIONS = [
  '충남 천안시',
  '충남 아산시',
  '충남 공주시',
  '대전 유성구',
  '세종시',
  '경기 수원시',
];

export function isCanonicalAdminRegion(value: string | null | undefined): boolean {
  return !!value && LABEL_SET.has(value);
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function applySidoAliases(value: string): string {
  let next = value;
  SIDO_ALIASES.forEach(([from, to]) => {
    next = next.replace(from, to);
  });
  return collapse(next);
}

function districtStem(district: string): string {
  return district.replace(/(시|군|구)$/, '');
}

/**
 * "천안", "천안시", "충청남도 천안시", "서울 강남구"를 표준 행정구역 라벨로 맞춘다.
 * 같은 이름이 여러 시·도에 있으면 null.
 */
export function canonicalizeAdminRegion(raw: string | null | undefined): string | null {
  const original = collapse(String(raw || ''));
  if (!original) return null;
  if (LABEL_SET.has(original)) return original;
  if (original === '세종' || original === '세종특별자치시') return '세종시';

  const text = applySidoAliases(original);
  if (LABEL_SET.has(text)) return text;
  if (text === '세종') return '세종시';

  const parts = text.split(' ').filter(Boolean);
  if (parts.length >= 2 && SIDO_NAMES.has(parts[0])) {
    const sido = parts[0];
    const rest = parts.slice(1).join('');
    const inSido = ADMIN_REGIONS.filter((row) => row.sido === sido);
    const exact = inSido.filter((row) => row.district === rest || row.label === `${sido} ${rest}`);
    if (exact.length === 1) return exact[0].label;
    const stemmed = inSido.filter((row) => districtStem(row.district) === districtStem(rest));
    if (stemmed.length === 1) return stemmed[0].label;
    return null;
  }

  const stem = districtStem(text);
  if (stem.length < 2 || SIDO_NAMES.has(stem)) return null;
  const unique = ADMIN_REGIONS.filter((row) => row.district === text || districtStem(row.district) === stem);
  if (unique.length === 1) return unique[0].label;
  return null;
}

export function searchAdminRegions(query: string, limit = 30): string[] {
  const trimmed = collapse(query);
  if (!trimmed) return [];
  const compact = trimmed.replace(/\s/g, '');
  const canon = canonicalizeAdminRegion(trimmed);
  const hits = ADMIN_REGIONS
    .map((row) => row.label)
    .filter((label) => label.includes(trimmed) || label.replace(/\s/g, '').includes(compact));
  if (canon && !hits.includes(canon)) hits.unshift(canon);
  return hits.slice(0, limit);
}
