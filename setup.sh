#!/usr/bin/env bash
set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║       Claude Telegram Setup          ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Check Node.js ──────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "✗ Node.js not found. Install from https://nodejs.org (v18+)"
  exit 1
fi
NODE_VERSION=$(node -e "process.stdout.write(process.version)")
echo "✓ Node.js $NODE_VERSION"

# ── 2. Check Claude CLI ───────────────────────────────────────────────────────
if ! command -v claude &>/dev/null; then
  echo ""
  echo "✗ Claude Code CLI not found."
  echo "  Install it: npm install -g @anthropic-ai/claude-code"
  echo "  Then run: claude (to authenticate)"
  exit 1
fi
echo "✓ Claude Code CLI found"

# ── 3. Install dependencies ───────────────────────────────────────────────────
echo ""
echo "Installing dependencies..."
npm install
echo "✓ Dependencies installed"

# ── 4. Create .env ────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "Created .env from .env.example"
fi

# ── 5. Interactive config ─────────────────────────────────────────────────────
echo ""
echo "Configure your bot:"
echo ""

read -p "  Telegram Bot Token (from @BotFather): " BOT_TOKEN
read -p "  Your Telegram User ID (from @userinfobot): " USER_ID
read -p "  Work directory for Claude [$(pwd)]: " WORK_DIR
WORK_DIR="${WORK_DIR:-$(pwd)}"

# Write .env
cat > .env <<EOF
TELEGRAM_BOT_TOKEN=$BOT_TOKEN
ALLOWED_USER_IDS=$USER_ID
WORK_DIR=$WORK_DIR
CLAUDE_MODEL=claude-sonnet-4-6
TIMEOUT_MS=120000
ALLOWED_TOOLS=Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch
EOF

echo ""
echo "✓ .env configured"

# ── 6. macOS auto-start (launchd) ─────────────────────────────────────────────
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo ""
  read -p "Set up auto-start on login (macOS launchd)? [Y/n]: " AUTOSTART
  AUTOSTART="${AUTOSTART:-Y}"

  if [[ "$AUTOSTART" =~ ^[Yy]$ ]]; then
    PLIST_PATH="$HOME/Library/LaunchAgents/com.claude-telegram.daemon.plist"
    NODE_PATH=$(which node)
    SCRIPT_PATH="$(pwd)/daemon.js"
    LOG_DIR="$(pwd)/logs"
    mkdir -p "$LOG_DIR"

    cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.claude-telegram.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$SCRIPT_PATH</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$(pwd)</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/daemon.error.log</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>
PLIST

    launchctl load "$PLIST_PATH"
    echo "✓ Auto-start enabled (launchd)"
    echo "  Logs: $LOG_DIR/daemon.log"
  fi
fi

# ── 7. Linux auto-start (systemd) ─────────────────────────────────────────────
if [[ "$OSTYPE" == "linux-gnu"* ]] && command -v systemctl &>/dev/null; then
  echo ""
  read -p "Set up auto-start (systemd user service)? [Y/n]: " AUTOSTART
  AUTOSTART="${AUTOSTART:-Y}"

  if [[ "$AUTOSTART" =~ ^[Yy]$ ]]; then
    SERVICE_DIR="$HOME/.config/systemd/user"
    mkdir -p "$SERVICE_DIR"
    LOG_DIR="$(pwd)/logs"
    mkdir -p "$LOG_DIR"
    NODE_PATH=$(which node)

    cat > "$SERVICE_DIR/claude-telegram.service" <<SERVICE
[Unit]
Description=Claude Telegram Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=$(pwd)
ExecStart=$NODE_PATH $(pwd)/daemon.js
Restart=always
RestartSec=10
StandardOutput=append:$LOG_DIR/daemon.log
StandardError=append:$LOG_DIR/daemon.error.log

[Install]
WantedBy=default.target
SERVICE

    systemctl --user daemon-reload
    systemctl --user enable claude-telegram
    systemctl --user start claude-telegram
    echo "✓ Auto-start enabled (systemd)"
    echo "  Status: systemctl --user status claude-telegram"
    echo "  Logs:   journalctl --user -u claude-telegram -f"
  fi
fi

echo ""
echo "══════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  Start manually:  npm start"
echo "  Send a message to your bot in Telegram."
echo "══════════════════════════════════════════"
echo ""
