# Claude Telegram — Setup Guide

## Wat is dit?

Claude Telegram koppelt je Telegram bot aan Claude Code. Je stuurt een bericht in Telegram, Claude antwoordt automatisch. Claude heeft toegang tot je bestanden, terminal, en het internet.

**Ideaal voor:**
- Developers die Claude willen gebruiken buiten hun IDE
- Teams die een AI agent willen op hun server
- Iedereen die Claude 24/7 beschikbaar wil via Telegram

---

## Hoe het werkt

```
Jij (Telegram) → Bot → daemon.js → claude -p → Bot → Jij (Telegram)
```

1. Je stuurt een bericht naar je Telegram bot
2. De daemon vangt het op via long polling
3. `claude -p` verwerkt het bericht als prompt
4. Claude voert eventueel acties uit (bestanden lezen, code schrijven, zoeken)
5. Het antwoord gaat terug naar Telegram

---

## Vereisten

- Node.js 18 of hoger
- Claude Code CLI (geïnstalleerd en geauthenticeerd)
- Een Telegram bot token van @BotFather
- Je Telegram user ID (via @userinfobot)

---

## Stap 1: Maak een Telegram bot

1. Open Telegram en zoek **@BotFather**
2. Stuur `/newbot`
3. Geef je bot een naam, bijv. `MijnClaude Bot`
4. Geef een gebruikersnaam, bijv. `mijn_claude_bot`
5. Kopieer het **bot token** — ziet er zo uit: `1234567890:AAE...`

---

## Stap 2: Vind je Telegram user ID

1. Open Telegram en zoek **@userinfobot**
2. Stuur `/start`
3. Kopieer je **Id** — bijv. `5998736052`

Dit is het enige account dat met de bot mag praten.

---

## Stap 3: Installeer Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
```

Authenticeer:

```bash
claude
```

Volg de login stappen. Je hebt een Anthropic account nodig.

---

## Stap 4: Installeer Claude Telegram

**Mac / Linux:**

```bash
git clone https://github.com/leadsblender/claude-telegram
cd claude-telegram
bash setup.sh
```

Het script vraagt om:
- Je bot token
- Je Telegram user ID
- De werkmap voor Claude (bijv. je projectmap)

---

## Stap 5: Auto-start instellen

### macOS
Het setup script maakt automatisch een launchd service aan. De daemon start bij elke login en herstart bij een crash.

```bash
# Stop
launchctl unload ~/Library/LaunchAgents/com.claude-telegram.daemon.plist

# Start
launchctl load ~/Library/LaunchAgents/com.claude-telegram.daemon.plist
```

### Linux / VPS
Het setup script maakt een systemd user service aan.

```bash
# Status
systemctl --user status claude-telegram

# Logs live volgen
journalctl --user -u claude-telegram -f

# Herstart
systemctl --user restart claude-telegram
```

---

## Handmatig starten

Zonder auto-start:

```bash
cd claude-telegram
npm start
```

Logs verschijnen direct in de terminal.

---

## Configuratie (.env)

| Instelling | Verplicht | Standaard | Omschrijving |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Ja | — | Token van @BotFather |
| `ALLOWED_USER_IDS` | Ja | — | Jouw Telegram user ID |
| `WORK_DIR` | Nee | Huidige map | Map waar Claude in werkt |
| `CLAUDE_MODEL` | Nee | claude-sonnet-4-6 | Claude model |
| `TIMEOUT_MS` | Nee | 120000 | Max reactietijd in ms |
| `ALLOWED_TOOLS` | Nee | Alle basis tools | Welke tools Claude mag gebruiken |

---

## Beveiliging

- Alleen gebruikers in `ALLOWED_USER_IDS` kunnen de bot gebruiken
- Alle andere berichten worden genegeerd
- Commit nooit je `.env` bestand (staat in .gitignore)
- Zet `WORK_DIR` op een specifieke projectmap, niet je home folder

---

## Veelgestelde vragen

**Claude reageert niet**
→ Controleer of de daemon draait. Check `logs/daemon.log`

**Twee bots reageren door elkaar**
→ Gebruik één bot token per daemon. Stop andere processen die dezelfde token gebruiken.

**Timeout errors**
→ Verhoog `TIMEOUT_MS` in je `.env` voor complexe taken

**Werkt op VPS?**
→ Ja. Zorg dat Claude CLI geïnstalleerd en geauthenticeerd is op de server.

---

## Download

GitHub: **https://github.com/leadsblender/claude-telegram**

```bash
git clone https://github.com/leadsblender/claude-telegram
cd claude-telegram
bash setup.sh
```
