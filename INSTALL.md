# Install via Claude Code

Open Claude Code in your terminal and paste this prompt:

---

```
Install the Claude Telegram daemon from https://github.com/leadsblender/claude-telegram

Steps to follow:
1. Check if Node.js 18+ is installed. If not, tell me to install it first.
2. Check if the Claude Code CLI (`claude`) is installed. If not, run: npm install -g @anthropic-ai/claude-code
3. Clone the repo to ~/claude-telegram: git clone https://github.com/leadsblender/claude-telegram ~/claude-telegram
4. Run npm install inside ~/claude-telegram
5. Ask me for my Telegram bot token (from @BotFather) and my Telegram user ID (from @userinfobot)
6. Create ~/claude-telegram/.env with those values and WORK_DIR set to my home directory
7. Set up auto-start:
   - On macOS: create a launchd plist at ~/Library/LaunchAgents/com.claude-telegram.daemon.plist and load it
   - On Linux: create a systemd user service at ~/.config/systemd/user/claude-telegram.service and enable it
8. Verify the daemon is running by checking the process list
9. Tell me to send a message to my bot in Telegram to test it
```

---

Claude Code will ask you two questions during setup:
- **Bot token** — get it from [@BotFather](https://t.me/BotFather) → `/newbot`
- **Your Telegram user ID** — get it from [@userinfobot](https://t.me/userinfobot) → `/start`

That's it. Claude does the rest.
