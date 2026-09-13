const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ehuyuhxkhhmouvkpsrrp.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_U6MtyWdVxX6jQwMiO9oR8w_K5-25uje';
const ORIGIN = 'https://t-volley-live.vercel.app';
const OG_IMAGE = `${ORIGIN}/og-logo.png`;
const OG_DESC = '로그인 없이 실시간 점수, 선발 명단, 문자 중계를 확인할 수 있습니다.';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function intramuralNames(description) {
  const m = String(description || '').match(/^\[(.*?)\ VS (.*?)\]/);
  if (!m) return null;
  return { host: m[1] || '홈팀', away: m[2] || '어웨이팀' };
}

module.exports = async (req, res) => {
  const raw = String(req.query.id || '').trim();
  let hostName = '홈팀';
  let awayName = '어웨이팀';

  if (raw) {
    try {
      const isShort = raw.toUpperCase().startsWith('TV-');
      const column = isShort ? 'short_code' : 'id';
      const lookup = isShort ? raw.toUpperCase() : raw;
      const url = `${SUPABASE_URL}/rest/v1/matches?${column}=eq.${encodeURIComponent(lookup)}&select=host_team_name,away_team_name,status,description&limit=1`;
      const response = await fetch(url, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      const rows = await response.json();
      const match = Array.isArray(rows) ? rows[0] : null;
      if (match) {
        const intra = match.status === 'intramural' ? intramuralNames(match.description) : null;
        hostName = intra?.host || match.host_team_name || hostName;
        awayName = intra?.away || match.away_team_name || awayName;
      }
    } catch {
      // crawler fallback keeps default names
    }
  }

  const title = `티볼리 라이브 전광판 | ${hostName} vs ${awayName}`;
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(OG_DESC)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(OG_DESC)}" />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(OG_DESC)}" />
  <meta name="twitter:image" content="${OG_IMAGE}" />
</head>
<body></body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).send(html);
};
