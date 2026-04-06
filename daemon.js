#!/usr/bin/env node
/**
 * Claude Telegram Daemon
 * Connects your Telegram bot to Claude Code (claude -p).
 * Messages from allowed users → Claude → reply back to Telegram.
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

// ── Config ────────────────────────────────────────────────────────────────────
const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USERS = (process.env.ALLOWED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const WORK_DIR     = process.env.WORK_DIR     || process.cwd();
const MODEL        = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const TIMEOUT_MS   = parseInt(process.env.TIMEOUT_MS || '120000', 10);
const ALLOWED_TOOLS = process.env.ALLOWED_TOOLS || 'Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch';

if (!BOT_TOKEN) {
  console.error('[claude-telegram] TELEGRAM_BOT_TOKEN is niet ingesteld. Maak een .env bestand aan.');
  process.exit(1);
}
if (ALLOWED_USERS.length === 0) {
  console.error('[claude-telegram] ALLOWED_USER_IDS is niet ingesteld. Voeg je Telegram user ID toe.');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
let offset = 0;
const processing = new Set();

// ── Telegram API ──────────────────────────────────────────────────────────────
function apiCall(method, params = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params);
    const req = https.request(
      `${API}/${method}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve({}); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendMessage(chatId, text) {
  // Split at 4000 chars (Telegram max is 4096)
  for (let i = 0; i < text.length; i += 4000) {
    await apiCall('sendMessage', {
      chat_id: chatId,
      text: text.slice(i, i + 4000),
    });
  }
}

async function sendTyping(chatId) {
  await apiCall('sendChatAction', { chat_id: chatId, action: 'typing' });
}

// ── Claude ────────────────────────────────────────────────────────────────────
function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--output-format', 'text',
      '--model', MODEL,
      '--allowedTools', ALLOWED_TOOLS,
      '--dangerously-skip-permissions',
    ];

    const proc = spawn('claude', args, {
      cwd: WORK_DIR,
      env: { ...process.env },
      timeout: TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let err = '';

    proc.stdout.on('data', (d) => (output += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));

    proc.on('close', () => {
      if (output.trim()) resolve(output.trim());
      else if (err.trim()) reject(new Error(err.trim().slice(0, 500)));
      else reject(new Error('No output received from Claude'));
    });

    proc.on('error', reject);
  });
}

// ── Message handler ───────────────────────────────────────────────────────────
async function handleMessage(msg) {
  const chatId = String(msg.chat.id);
  const userId = String(msg.from?.id);
  const text   = msg.text;

  if (!text || text.startsWith('/')) return;

  if (!ALLOWED_USERS.includes(userId)) {
    console.log(`[claude-telegram] Blocked: user ${userId}`);
    return;
  }

  if (processing.has(chatId)) {
    await sendMessage(chatId, 'Still processing your previous message, please wait...');
    return;
  }

  processing.add(chatId);
  console.log(`[claude-telegram] Message from ${userId}: ${text.slice(0, 80)}`);

  const typingInterval = setInterval(() => sendTyping(chatId), 4000);
  await sendTyping(chatId);

  try {
    const response = await runClaude(text);
    clearInterval(typingInterval);
    await sendMessage(chatId, response);
    console.log(`[claude-telegram] Replied (${response.length} chars)`);
  } catch (err) {
    clearInterval(typingInterval);
    await sendMessage(chatId, `Error: ${err.message}`);
    console.error(`[claude-telegram] Error:`, err.message);
  } finally {
    processing.delete(chatId);
  }
}

// ── Long polling ──────────────────────────────────────────────────────────────
async function poll() {
  try {
    const res = await apiCall('getUpdates', {
      offset,
      timeout: 30,
      allowed_updates: ['message'],
    });

    if (res.ok && res.result?.length) {
      for (const update of res.result) {
        offset = update.update_id + 1;
        if (update.message) {
          handleMessage(update.message); // intentionally not awaited — parallel
        }
      }
    }
  } catch (err) {
    console.error('[claude-telegram] Poll error:', err.message);
    await new Promise((r) => setTimeout(r, 5000));
  }

  setImmediate(poll);
}

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  const me = await apiCall('getMe');
  if (!me.ok) {
    console.error('[claude-telegram] Invalid bot token:', me.description);
    process.exit(1);
  }
  console.log(`[claude-telegram] Started as @${me.result.username}`);
  console.log(`[claude-telegram] Work dir: ${WORK_DIR}`);
  console.log(`[claude-telegram] Model:    ${MODEL}`);
  console.log(`[claude-telegram] Allowed:  ${ALLOWED_USERS.join(', ')}`);
  poll();
}

process.on('SIGINT',  () => { console.log('\n[claude-telegram] Stopped.'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n[claude-telegram] Stopped.'); process.exit(0); });

start();
