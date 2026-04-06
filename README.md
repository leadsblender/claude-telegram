# Claude Telegram

Connect your Telegram bot to Claude Code. Send a message in Telegram, Claude responds with full tool access (file read/write, bash, web search, etc.).

## How it works

```
You (Telegram) → Bot → daemon.js → claude -p → Bot → You (Telegram)
```

The daemon polls your Telegram bot for new messages, runs `claude -p` with the message as the prompt, and sends the response back. Claude runs in your working directory and can use tools you allow.

## Requirements

- Node.js 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your Telegram user ID (get it from [@userinfobot](https://t.me/userinfobot))

## Quick start

```bash
git clone https://github.com/leadsblender/claude-telegram
cd claude-telegram
bash setup.sh
```

The setup script:
1. Checks Node.js and Claude CLI are installed
2. Installs dependencies (`dotenv`)
3. Creates your `.env` file interactively
4. Optionally sets up auto-start (launchd on macOS, systemd on Linux)

## Manual setup

```bash
cp .env.example .env
# Edit .env with your values
npm install
npm start
```

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Token from @BotFather |
| `ALLOWED_USER_IDS` | Yes | — | Telegram user ID(s), comma-separated |
| `WORK_DIR` | No | Current dir | Directory Claude works from |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-6` | Claude model to use |
| `TIMEOUT_MS` | No | `120000` | Max response time in ms |
| `ALLOWED_TOOLS` | No | All common tools | Comma-separated Claude tools |

## Security

- Only `ALLOWED_USER_IDS` can interact with the bot. All other users are silently blocked.
- Never commit your `.env` file. It is in `.gitignore` by default.
- Claude only runs in `WORK_DIR`. Point it at a project folder, not your home directory.

## Auto-start

### macOS (launchd)
The setup script creates a launchd plist that starts the daemon on login and restarts it if it crashes.

To stop: `launchctl unload ~/Library/LaunchAgents/com.claude-telegram.daemon.plist`  
To start: `launchctl load ~/Library/LaunchAgents/com.claude-telegram.daemon.plist`

### Linux (systemd)
```bash
systemctl --user status claude-telegram
systemctl --user restart claude-telegram
journalctl --user -u claude-telegram -f
```

## Logs

Logs are written to `logs/daemon.log` and `logs/daemon.error.log` in the project directory.

## License

MIT
