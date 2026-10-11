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

function intramuralNames(description) {
  const matched = String(description || '').match(/^\[(.*?)\ VS (.*?)\]/);
  if (!matched) return null;
  return { host: matched[1] || 'A팀', away: matched[2] || 'B팀' };
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
    if (!response.ok) return null;
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] || null : null;
  };

  const byId = await load(`id=eq.${encodeURIComponent(id)}`);
  if (byId) return byId;
  if (id.toUpperCase().startsWith('TV-')) {
    return load(`short_code=eq.${encodeURIComponent(id.toUpperCase())}`);
  }
  return null;
}

module.exports = async (req, res) => {
  const id = String(req.query.id || '').trim();
  let teamA = 'A팀';
  let teamB = 'B팀';
  let matchDate = '';

  if (id) {
    try {
      const match = await fetchMatch(id);
      if (match) {
        const intra = match.status === 'intramural' ? intramuralNames(match.description) : null;
        teamA = intra?.host || match.host_team_name || teamA;
        teamB = intra?.away || match.away_team_name || teamB;
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
