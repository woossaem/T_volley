const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ehuyuhxkhhmouvkpsrrp.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_U6MtyWdVxX6jQwMiO9oR8w_K5-25uje';
const ORIGIN = 'https://t-volley-live.vercel.app';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function teamLabel(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return fallback;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return teamLabel(JSON.parse(trimmed), fallback);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const label = teamLabel(item, '');
      if (label) return label;
    }
    return fallback;
  }
  if (typeof value === 'object') {
    return teamLabel(value.name || value.team_name || value.formatted || value.title || value.label, fallback);
  }
  return fallback;
}

function intramuralNames(description) {
  const matched = String(description || '').match(/^\[(.*?)\ VS (.*?)\]/);
  if (!matched) return null;
  return { host: teamLabel(matched[1], 'A팀'), away: teamLabel(matched[2], 'B팀') };
}

function formatMatchDate(match) {
  const raw = match?.match_date || match?.created_at || '';
  const text = String(raw || '').trim();
  if (!text) return '';
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime()) && text.includes('T')) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  }
  return text.slice(0, 10);
}

async function fetchMatch(id) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept: 'application/json',
  };
  const load = async (query) => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/matches?${query}&select=*&limit=1`, { headers });
    const rows = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(rows)) return null;
    return rows[0] || null;
  };

  const byId = await load(`id=eq.${encodeURIComponent(id)}`);
  if (byId) return byId;
  if (id.toUpperCase().startsWith('TV-')) {
    return load(`short_code=eq.${encodeURIComponent(id.toUpperCase())}`);
  }
  return null;
}

module.exports = async (req, res) => {
  const rawId = req.query?.id;
  const id = String(Array.isArray(rawId) ? rawId[0] : rawId || '').trim();
  let teamA = 'A팀';
  let teamB = 'B팀';
  let matchDate = '';

  if (id) {
    try {
      const match = await fetchMatch(id);
      if (match) {
        const intra = match.status === 'intramural' ? intramuralNames(match.description) : null;
        teamA = teamLabel(intra?.host || match.host_team_name, teamA);
        teamB = teamLabel(intra?.away || match.away_team_name, teamB);
        matchDate = formatMatchDate(match);
      }
    } catch {
      // 수집 봇에는 기본 팀 이름으로 응답한다.
    }
  }

  const safeId = encodeURIComponent(id);
  const title = `티볼리 라이브 전광판 | ${teamA} vs ${teamB}`;
  const description = `[${matchDate}] 로그인 없이 실시간 점수, 선발 명단, 문자 중계를 확인할 수 있습니다.`;
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${ORIGIN}/og-logo.png" />
  <meta property="og:url" content="${ORIGIN}/live/${safeId}" />
</head>
<body>
  <script>window.location.href = "/live/${safeId}";</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).send(html);
};
