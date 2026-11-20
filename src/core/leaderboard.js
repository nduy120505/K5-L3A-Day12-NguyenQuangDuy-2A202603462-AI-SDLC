// Local leaderboard rules (Ticket-04 §3). Pure functions shared by the server and the browser.
export const MAX_ENTRIES = 10;
// 3–12 chars of [A-Za-z0-9_]; Vietnamese letters with diacritics are also accepted (bonus).
const NAME_RE = /^[A-Za-z0-9_À-ɏḀ-ỿ]{3,12}$/u;

export function normalizeName(name) {
  return String(name ?? '').normalize('NFC').trim();
}

export function validName(name) {
  return NAME_RE.test(normalizeName(name));
}

/** ISO 8601 with the local timezone offset, e.g. 2026-11-20T15:04:05+07:00 */
export function isoLocal(d = new Date()) {
  const pad = (n) => String(Math.abs(Math.trunc(n))).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

export function validEntry(e) {
  return (
    e && validName(e.name) &&
    Number.isInteger(e.score) && e.score >= 0 &&
    Number.isInteger(e.nights_won) && e.nights_won >= 0 && e.nights_won <= 3 &&
    typeof e.achieved_at === 'string' && !Number.isNaN(Date.parse(e.achieved_at)) &&
    Number.isInteger(e.seed)
  );
}

/** score desc; ties → whoever achieved it first ranks higher; keep top 10 */
export function sortEntries(entries) {
  return [...entries]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.score - a.e.score || Date.parse(a.e.achieved_at) - Date.parse(b.e.achieved_at) || a.i - b.i)
    .map((x) => x.e)
    .slice(0, MAX_ENTRIES);
}

export function addEntry(entries, entry) {
  const e = { name: normalizeName(entry.name), score: entry.score, nights_won: entry.nights_won, achieved_at: entry.achieved_at ?? isoLocal(), seed: entry.seed };
  if (!validEntry(e)) throw new Error('invalid leaderboard entry');
  return sortEntries([...entries, e]);
}
