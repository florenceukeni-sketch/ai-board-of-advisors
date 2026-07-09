'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const { ADVISORS } = require('./advisors');
const { MODEL, MAX_TOKENS_IND, MAX_TOKENS_BRD, PORT, DATA_DIR } = require('./config');

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Bootstrap data directories and memories file on startup
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const BOARD_DIR = path.join(DATA_DIR, 'board-sessions');
const MEMORIES_FILE = path.join(DATA_DIR, 'memories.json');

fs.mkdirSync(SESSIONS_DIR, { recursive: true });
fs.mkdirSync(BOARD_DIR, { recursive: true });
if (!fs.existsSync(MEMORIES_FILE)) fs.writeFileSync(MEMORIES_FILE, '[]', 'utf8');

// Helpers
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Security: only accept advisor IDs that exist in ADVISORS.
// Prevents path traversal (e.g. /api/sessions/../../etc) since these
// IDs get used to build filesystem paths.
function isValidAdvisorId(id) {
  return ADVISORS.some(a => a.id === id);
}

function buildSystemPrompt(adv, memories, boardMode) {
  let sys = adv.sp;

  if (memories.length > 0) {
    sys += `\n\nContext from past sessions with Flo:\n${memories.slice(-10).map(m => '• ' + m).join('\n')}`;
  }

  if (boardMode) {
    if (boardMode.isOpener) {
      sys += `\n\nYou are OPENING a board session debate. Topic from Flo: "${boardMode.topic}"\n\nSet your perspective clearly in 2 tight paragraphs. The other 5 advisors will respond after you.`;
    } else {
      sys += `\n\nYou are in a BOARD SESSION DEBATE. Topic from Flo: "${boardMode.topic}"\n\nWhat your colleagues said:\n${boardMode.debateLog}\nNow give YOUR distinct perspective. Engage with specific points from your colleagues — agree, push back, or build on what they said where relevant. 2 tight paragraphs. Don't repeat what's been said; add your specific angle.`;
    }
  }

  return sys;
}

// POST /api/chat
app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set. Check your .env file.' });
  }

  const { advisorId, messages, boardMode, max_tokens } = req.body;

  const adv = ADVISORS.find(a => a.id === advisorId);
  if (!adv) {
    return res.status(400).json({ error: `Unknown advisorId: ${advisorId}` });
  }

  const memories = readJSON(MEMORIES_FILE, []);
  const system = buildSystemPrompt(adv, memories, boardMode || null);
  const maxTok = max_tokens || (boardMode ? MAX_TOKENS_BRD : MAX_TOKENS_IND);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTok, system, messages })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || `API error ${response.status}` });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

// GET /api/advisors — UI-safe data (no sp)
app.get('/api/advisors', (req, res) => {
  const ui = ADVISORS.map(({ sp, ...rest }) => rest);
  res.json(ui);
});

// GET /api/sessions/:advisorId — most recent session
app.get('/api/sessions/:advisorId', (req, res) => {
  if (!isValidAdvisorId(req.params.advisorId)) return res.status(400).json({ error: 'Unknown advisor' });
  const dir = path.join(SESSIONS_DIR, req.params.advisorId);
  if (!fs.existsSync(dir)) return res.json(null);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) return res.json(null);
  const latest = readJSON(path.join(dir, files[files.length - 1]), null);
  res.json(latest);
});

// POST /api/sessions/:advisorId — save today's session
app.post('/api/sessions/:advisorId', (req, res) => {
  if (!isValidAdvisorId(req.params.advisorId)) return res.status(400).json({ error: 'Unknown advisor' });
  const { messages } = req.body;
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages must be an array' });
  const dir = path.join(SESSIONS_DIR, req.params.advisorId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${todayStr()}.json`);
  writeJSON(file, { advisorId: req.params.advisorId, date: todayStr(), messages });
  res.json({ ok: true });
});

// DELETE /api/sessions/:advisorId — clear all sessions
app.delete('/api/sessions/:advisorId', (req, res) => {
  if (!isValidAdvisorId(req.params.advisorId)) return res.status(400).json({ error: 'Unknown advisor' });
  const dir = path.join(SESSIONS_DIR, req.params.advisorId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  res.json({ ok: true });
});

// GET /api/memory
app.get('/api/memory', (req, res) => {
  res.json({ memories: readJSON(MEMORIES_FILE, []) });
});

// POST /api/memory — add a memory
app.post('/api/memory', (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });
  const mems = readJSON(MEMORIES_FILE, []);
  mems.push(text.trim());
  if (mems.length > 25) mems.splice(0, mems.length - 25);
  writeJSON(MEMORIES_FILE, mems);
  res.json({ memories: mems });
});

// DELETE /api/memory — remove by exact text match
app.delete('/api/memory', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const mems = readJSON(MEMORIES_FILE, []);
  const idx = mems.indexOf(text);
  if (idx !== -1) mems.splice(idx, 1);
  writeJSON(MEMORIES_FILE, mems);
  res.json({ memories: mems });
});

// POST /api/board-sessions — save completed board session
app.post('/api/board-sessions', (req, res) => {
  const { topic, thread } = req.body;
  if (!topic || !Array.isArray(thread)) return res.status(400).json({ error: 'topic and thread required' });
  const now = new Date();
  const ts = now.toISOString().replace(/:/g, '-').slice(0, 16);
  const file = path.join(BOARD_DIR, `${ts}.json`);
  writeJSON(file, { ts: now.getTime(), topic, thread });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  const key = process.env.ANTHROPIC_API_KEY;
  console.log('\n  Board of Advisors');
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → API key: ${key ? '✓ configured' : '✗ MISSING — add ANTHROPIC_API_KEY to .env'}`);
  console.log(`  → Data dir: ${DATA_DIR}\n`);
});
