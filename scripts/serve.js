// Game server (no dependencies).
//   node scripts/serve.js [port]                       → serve the game on http://localhost:5173
//   node scripts/serve.js --export-leaderboard out.json → write {"entries":[…]} (sorted) and exit
// The local leaderboard is stored on disk in data/leaderboard.json (survives restarts).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addEntry, sortEntries, validEntry } from '../src/core/leaderboard.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.DDL_LEADERBOARD || path.join(ROOT, 'data', 'leaderboard.json');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
};

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(DB, 'utf8'));
    return sortEntries((data.entries ?? []).filter(validEntry));
  } catch {
    return [];
  }
}
function save(entries) {
  fs.mkdirSync(path.dirname(DB), { recursive: true });
  fs.writeFileSync(DB + '.tmp', JSON.stringify({ entries }, null, 2));
  fs.renameSync(DB + '.tmp', DB);
}

const argv = process.argv.slice(2);
const ei = argv.indexOf('--export-leaderboard');
if (ei >= 0) {
  const out = argv[ei + 1];
  if (!out) {
    process.stderr.write('error: --export-leaderboard <out.json>\n');
    process.exit(1);
  }
  fs.writeFileSync(out, JSON.stringify({ entries: load() }, null, 2) + '\n');
  process.exit(0);
}

const PORT = Number(argv.find((a) => /^\d+$/.test(a)) || process.env.PORT || 5173);
http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/leaderboard') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (req.method === 'GET') return res.end(JSON.stringify({ entries: load() }));
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (c) => {
          body += c;
          if (body.length > 10000) req.destroy();
        });
        req.on('end', () => {
          try {
            const e = JSON.parse(body);
            const entries = addEntry(load(), { ...e, achieved_at: undefined });
            save(entries);
            res.end(JSON.stringify({ entries }));
          } catch (err) {
            res.writeHead(400).end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }
      return res.writeHead(405).end();
    }
    const urlPath = decodeURIComponent(url.pathname);
    const file = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
    if (!file.startsWith(ROOT) || file.startsWith(path.join(ROOT, 'data'))) return res.writeHead(403).end();
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end('not found');
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Đảo Đèn Lồng: open http://localhost:${PORT}`));
