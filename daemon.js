#!/usr/bin/env node
/**
 * Claude Telegram Daemon
 * Connects your Telegram bot to Claude Code (claude -p).
 * Messages from allowed users → Claude → reply back to Telegram.
 *
 * Portal workflow: daemon handles all API calls itself.
 * Claude is only used for content generation per task.
 *
 * Requirements:
 *   - Node.js 18+
 *   - Claude Code CLI installed: npm install -g @anthropic-ai/claude-code
 *   - A Telegram bot token from @BotFather
 *
 * Setup: copy .env.example to .env and fill in your values.
 */

require('dotenv').config();
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');

// ── Config ────────────────────────────────────────────────────────────────────
const BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USERS = (process.env.ALLOWED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const WORK_DIR      = process.env.WORK_DIR      || process.cwd();
const MODEL         = process.env.CLAUDE_MODEL  || 'claude-sonnet-4-6';
const TIMEOUT_MS    = parseInt(process.env.TIMEOUT_MS || '300000', 10); // 5 min per task
const ALLOWED_TOOLS = process.env.ALLOWED_TOOLS || 'Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch';
const PORTAL_URL    = process.env.PORTAL_URL    || '';
const PORTAL_KEY    = process.env.PORTAL_API_KEY || '';

if (!BOT_TOKEN) {
  console.error('[claude-telegram] TELEGRAM_BOT_TOKEN niet ingesteld.');
  process.exit(1);
}
if (ALLOWED_USERS.length === 0) {
  console.error('[claude-telegram] ALLOWED_USER_IDS niet ingesteld.');
  process.exit(1);
}

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const PORTAL_TRIGGER = /^(voer uit|doe maar|go ahead|run it|fais-le|ejecuta|ausführen)/i;

let offset = 0;
const processing = new Set();

// ── HTTP helper ───────────────────────────────────────────────────────────────
function request(url, opts = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const data = body ? JSON.stringify(body) : null;

    const req = lib.request(url, {
      method: opts.method || (data ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(opts.headers || {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Telegram API ──────────────────────────────────────────────────────────────
function tgCall(method, params = {}) {
  return request(`${TG_API}/${method}`, { method: 'POST' }, params)
    .then(r => r.body)
    .catch(() => ({}));
}

async function sendMessage(chatId, text) {
  for (let i = 0; i < text.length; i += 4000) {
    await tgCall('sendMessage', { chat_id: chatId, text: text.slice(i, i + 4000) });
  }
}

async function sendTyping(chatId) {
  await tgCall('sendChatAction', { chat_id: chatId, action: 'typing' });
}

// ── Portal API ────────────────────────────────────────────────────────────────
function portalHeaders() {
  return { 'Authorization': `Bearer ${PORTAL_KEY}` };
}

async function portalGet(path) {
  const r = await request(`${PORTAL_URL}${path}`, { headers: portalHeaders() });
  if (r.status !== 200) throw new Error(`Portal GET ${path} → ${r.status}`);
  return r.body;
}

async function portalPost(path, body) {
  const r = await request(`${PORTAL_URL}${path}`, { method: 'POST', headers: portalHeaders() }, body);
  if (r.status >= 400) throw new Error(`Portal POST ${path} → ${r.status}`);
  return r.body;
}

// ── Claude ────────────────────────────────────────────────────────────────────
function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const uid = process.env.CLAUDE_UID ? parseInt(process.env.CLAUDE_UID) : null;
    const gid = process.env.CLAUDE_GID ? parseInt(process.env.CLAUDE_GID) : null;
    const claudeHome = process.env.CLAUDE_HOME || process.env.HOME;
    const claudeBin  = process.env.CLAUDE_BIN  || 'claude';

    const args = [
      '-p', prompt,
      '--output-format', 'text',
      '--model', MODEL,
      '--allowedTools', ALLOWED_TOOLS,
      '--dangerously-skip-permissions',
    ];

    const proc = spawn(claudeBin, args, {
      cwd: WORK_DIR,
      env: {
        ...process.env,
        HOME: claudeHome,
        PATH: `${claudeHome}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
      },
      timeout: TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(uid ? { uid, gid } : {}),
    });

    let output = '', err = '';
    proc.stdout.on('data', d => output += d.toString());
    proc.stderr.on('data', d => err += d.toString());
    proc.on('close', () => {
      if (output.trim()) resolve(output.trim());
      else if (err.trim()) reject(new Error(err.trim().slice(0, 500)));
      else reject(new Error('Geen output ontvangen van Claude'));
    });
    proc.on('error', reject);
  });
}

// ── Portal workflow ───────────────────────────────────────────────────────────
async function runPortalWorkflow(chatId) {
  if (!PORTAL_URL || !PORTAL_KEY) {
    await sendMessage(chatId, 'Portal niet geconfigureerd. Voeg PORTAL_URL en PORTAL_API_KEY toe aan je .env');
    return;
  }

  // 1. Haal pending tasks op
  const data = await portalGet('/api/v1/pending-tasks');
  const tasks = data.tasks || [];

  if (tasks.length === 0) {
    await sendMessage(chatId, 'Geen openstaande opdrachten gevonden.');
    return;
  }

  await sendMessage(chatId, `${tasks.length} opdracht(en) gevonden. Start uitvoering...`);

  let done = 0;
  let failed = 0;

  for (const task of tasks) {
    const typingInterval = setInterval(() => sendTyping(chatId), 4000);
    await sendTyping(chatId);

    try {
      console.log(`[portal] Taak ${task.id}: ${task.name_nl}`);

      // 2. Haal prompt op
      const promptData = await portalGet(`/api/v1/tools/${task.tool_id}/prompt`);
      const prompt = promptData.prompt || promptData.content || JSON.stringify(promptData);

      // 3. Laat Claude de inhoud genereren
      const result = await runClaude(prompt);

      // 4. Post resultaat terug
      await portalPost(`/api/v1/tools/${task.tool_id}/result`, {
        content: result,
        source: 'claude-code',
      });

      // 5. Markeer als klaar
      await portalPost('/api/v1/pending-tasks', {
        taskId: task.id,
        status: 'done',
      });

      clearInterval(typingInterval);
      done++;
      await sendMessage(chatId, `Klaar: ${task.name_nl} (${done}/${tasks.length})`);
      console.log(`[portal] Taak ${task.id} klaar`);

    } catch (err) {
      clearInterval(typingInterval);
      failed++;
      await sendMessage(chatId, `Fout bij "${task.name_nl}": ${err.message}`);
      console.error(`[portal] Taak ${task.id} fout:`, err.message);
    }
  }

  await sendMessage(chatId, `Klaar. ${done} geslaagd, ${failed} mislukt.`);
}

// ── Message handler ───────────────────────────────────────────────────────────
async function handleMessage(msg) {
  const chatId = String(msg.chat.id);
  const userId = String(msg.from?.id);
  const text   = msg.text;

  if (!text || text.startsWith('/')) return;

  if (!ALLOWED_USERS.includes(userId)) {
    console.log(`[claude-telegram] Geblokkeerd: ${userId}`);
    return;
  }

  if (processing.has(chatId)) {
    await sendMessage(chatId, 'Nog bezig met vorige opdracht, even geduld...');
    return;
  }

  processing.add(chatId);
  console.log(`[claude-telegram] Bericht van ${userId}: ${text.slice(0, 80)}`);

  try {
    if (PORTAL_TRIGGER.test(text.trim())) {
      // Portal workflow: daemon doet API calls, Claude genereert inhoud
      await runPortalWorkflow(chatId);
    } else {
      // Normaal bericht: stuur naar Claude
      const typingInterval = setInterval(() => sendTyping(chatId), 4000);
      await sendTyping(chatId);
      try {
        const response = await runClaude(text);
        clearInterval(typingInterval);
        await sendMessage(chatId, response);
        console.log(`[claude-telegram] Antwoord verstuurd (${response.length} chars)`);
      } catch (err) {
        clearInterval(typingInterval);
        await sendMessage(chatId, `Fout: ${err.message}`);
        console.error(`[claude-telegram] Fout:`, err.message);
      }
    }
  } finally {
    processing.delete(chatId);
  }
}

// ── Long polling ──────────────────────────────────────────────────────────────
async function poll() {
  try {
    const res = await tgCall('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
    if (res.ok && res.result?.length) {
      for (const update of res.result) {
        offset = update.update_id + 1;
        if (update.message) handleMessage(update.message);
      }
    }
  } catch (err) {
    console.error('[claude-telegram] Poll fout:', err.message);
    await new Promise(r => setTimeout(r, 5000));
  }
  setImmediate(poll);
}

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  const me = await tgCall('getMe');
  if (!me.ok) {
    console.error('[claude-telegram] Ongeldig bot token:', me.description);
    process.exit(1);
  }
  console.log(`[claude-telegram] Gestart als @${me.result.username}`);
  console.log(`[claude-telegram] Werkmap:  ${WORK_DIR}`);
  console.log(`[claude-telegram] Model:    ${MODEL}`);
  console.log(`[claude-telegram] Allowed:  ${ALLOWED_USERS.join(', ')}`);
  console.log(`[claude-telegram] Portal:   ${PORTAL_URL || 'niet geconfigureerd'}`);
  poll();
}

process.on('SIGINT',  () => { console.log('\n[claude-telegram] Gestopt.'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n[claude-telegram] Gestopt.'); process.exit(0); });

start();
