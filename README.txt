================================================================================
  TRADING OS — INSTALLATION & SETUP GUIDE
  Professional Desktop Trading System with AI Agents
================================================================================

CONTENTS
--------
  1. System Requirements
  2. Installation Steps
  3. First-Time Setup (API Keys)
  4. Getting Each API Key (Step by Step)
  5. What Each API Does
  6. After Installation
  7. Troubleshooting
  8. Support


────────────────────────────────────────────────────────────────────────────────
1. SYSTEM REQUIREMENTS
────────────────────────────────────────────────────────────────────────────────

  • Windows 10 or Windows 11 (64-bit)
  • 4 GB RAM minimum (8 GB recommended)
  • 500 MB free disk space
  • Internet connection (for live prices and AI features)

  No special Windows settings required. Just double-click and install.


────────────────────────────────────────────────────────────────────────────────
2. INSTALLATION STEPS
────────────────────────────────────────────────────────────────────────────────

  Step 1: Double-click "Trading OS Setup X.X.X.exe"

  Step 2: If Windows SmartScreen appears:
          → Click "More info"
          → Click "Run anyway"

          This warning appears because the app is not signed by Microsoft.
          It is completely safe — this is normal for independent software
          that hasn't paid for a Microsoft code-signing certificate.

  Step 3: The installer wizard opens.
          Choose your installation folder (or leave the default).
          Click Install and wait for it to finish.

  Step 4: Click Finish. A shortcut appears on your Desktop and Start Menu.

  Step 5: Launch "Trading OS" from the Desktop shortcut.

  Step 6: The Setup Wizard opens on first launch.
          Follow the 5 steps to enter your name and API keys.


────────────────────────────────────────────────────────────────────────────────
3. FIRST-TIME SETUP (API KEYS)
────────────────────────────────────────────────────────────────────────────────

  The setup wizard walks you through 5 steps:

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Step 1 │ Your Name           │ Just enter your name                    │
  │  Step 2 │ Anthropic API Key   │ REQUIRED — powers all AI features       │
  │  Step 3 │ Telegram Bot        │ Optional — phone alerts for signals     │
  │  Step 4 │ NewsAPI + Finnhub   │ Optional — news and earnings data       │
  │  Step 5 │ Done                │ Review and launch                       │
  └─────────────────────────────────────────────────────────────────────────┘

  You can skip optional steps and add the keys later from the Dashboard tab.


────────────────────────────────────────────────────────────────────────────────
4. GETTING EACH API KEY (STEP BY STEP)
────────────────────────────────────────────────────────────────────────────────

  ── ANTHROPIC API KEY (Required) ─────────────────────────────────────────────

  Website: https://console.anthropic.com

  1. Go to console.anthropic.com
  2. Click "Sign Up" and create a free account
  3. Verify your email
  4. Go to "API Keys" in the left menu
  5. Click "Create Key" → give it a name (e.g. "Trading OS")
  6. Copy the key — it starts with "sk-ant-api03-..."
  7. Paste it into the setup wizard

  Cost: Pay-as-you-go. Each AI scan costs approximately $0.05–$0.15.
        Anthropic gives $5 free credit on signup — enough for ~50 scans.
        You only pay when you click AI buttons — background scans are free.

  ── TELEGRAM BOT (Optional) ──────────────────────────────────────────────────

  You need TWO things: a Bot Token and your Chat ID.

  GET YOUR BOT TOKEN:
  1. Open Telegram on your phone or computer
  2. Search for "@BotFather" (official Telegram bot, blue checkmark)
  3. Send the message: /newbot
  4. Follow the prompts — choose any name and username for your bot
  5. BotFather sends you a token like: 1234567890:AAHXWTYo_Ug1xxx...
  6. Copy this token → paste into "Bot Token" field

  GET YOUR CHAT ID:
  1. In Telegram, search for "@userinfobot"
  2. Send any message to it (e.g. "hi")
  3. It replies with your user info including your Chat ID (a number)
  4. Copy the number → paste into "Chat ID" field

  ── NEWSAPI KEY (Optional, Free) ─────────────────────────────────────────────

  Website: https://newsapi.org/register

  1. Go to newsapi.org/register
  2. Enter your name and email — no credit card needed
  3. Click "Submit" → check your email → verify
  4. Your API key is shown on the dashboard
  5. Copy and paste it into the setup wizard

  Free tier: 100 requests/day. More than enough for daily use.

  ── FINNHUB KEY (Optional, Free) ─────────────────────────────────────────────

  Website: https://finnhub.io/register

  1. Go to finnhub.io/register
  2. Create a free account
  3. Your API key is shown immediately on the dashboard
  4. Copy and paste it into the setup wizard

  Free tier: 60 requests/minute. Used only for earnings calendar (weekly).


────────────────────────────────────────────────────────────────────────────────
5. WHAT EACH API DOES
────────────────────────────────────────────────────────────────────────────────

  ANTHROPIC   → Powers the AI chat assistant, CEO trading signal agent,
                and the monthly trading diary generator.
                Without it: app works but AI features are disabled.

  TELEGRAM    → Sends trade signals and alerts to your phone.
                Without it: signals only visible in the Agents tab.

  NEWSAPI     → Provides financial news headlines for sentiment analysis.
                Without it: WhatsHot agent uses Reddit only (still works).

  FINNHUB     → Provides earnings calendar (avoid trading before earnings).
                Without it: earnings filter is disabled (higher risk).

  YAHOO FINANCE → Built in, no key needed. Powers all live price data,
                  150 SMA calculations, and position P&L.


────────────────────────────────────────────────────────────────────────────────
6. AFTER INSTALLATION
────────────────────────────────────────────────────────────────────────────────

  FIRST LAUNCH:
  • The backend server starts automatically with the app (port 3000)
  • Live prices refresh every 60 seconds automatically
  • Agents scan every hour during market hours (9:30 AM – 4:00 PM ET)

  ADDING YOUR ACCOUNT VALUE:
  • Go to Dashboard tab → find the account value section
  • Enter your current portfolio value in USD
  • This is used for position sizing calculations

  ADDING A TRADE:
  • Go to Positions tab → fill in the form → click "Add Position"
  • Required: Ticker, Shares, Entry, Stop, Pattern
  • Stop loss is required — the system enforces discipline

  CLOSING A TRADE:
  • Go to Positions tab → click the close button next to the position
  • Enter your exit price and any execution notes
  • The trade is automatically scored and your ELO updated

  CHANGING API KEYS LATER:
  • Dashboard tab → scroll to the API Keys section
  • Enter a new key and save — updates immediately, no restart needed
  • Keys are stored locally on your machine only


────────────────────────────────────────────────────────────────────────────────
7. TROUBLESHOOTING
────────────────────────────────────────────────────────────────────────────────

  PROBLEM: "Windows protected your PC" warning during install
  SOLUTION: Click "More info" → "Run anyway"
            This is a standard SmartScreen warning for unsigned apps.
            The app is safe — it just doesn't have a Microsoft certificate.

  PROBLEM: Prices not loading / showing as $0.00
  SOLUTION: Check your internet connection. Prices load from Yahoo Finance
            through a proxy — requires internet.

  PROBLEM: AI chat gives "no response" error
  SOLUTION: Check your Anthropic API key in Dashboard tab.
            Make sure you have credit at console.anthropic.com

  PROBLEM: No Telegram alerts
  SOLUTION: Verify your Bot Token and Chat ID in Dashboard tab.
            Send /start to your bot in Telegram first.

  PROBLEM: App shows "Backend offline"
  SOLUTION: Close and reopen the app. The backend server starts
            automatically — if it fails, a restart usually fixes it.

  PROBLEM: Agents tab shows no signals
  SOLUTION: Agents scan hourly during US market hours (9:30–16:00 ET).
            Outside market hours no signals are generated.
            You can trigger a manual scan in the Agents tab.


────────────────────────────────────────────────────────────────────────────────
8. SUPPORT
────────────────────────────────────────────────────────────────────────────────

  App installed to (default):
    C:\Program Files\Dima Trading OS\

  Data location (trades, settings — survives uninstall):
    C:\Users\[YourName]\AppData\Roaming\Dima Trading OS\

  Your data never leaves your machine. No cloud sync, no subscription.
  All AI calls go directly to Anthropic using your own API key.

================================================================================
  Trading OS — Built for serious retail traders
  Version 1.0.3 · 2026
================================================================================
