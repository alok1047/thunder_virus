# ☠️ RepoReady — Supply Chain Attack Simulator

> **Thunder Hackathon 3.0** — Educational project demonstrating how a trusted dev tool can hide malware-level capabilities in plain sight.

---

## What is this?

RepoReady has **two faces**:

# 😇 Innocent Phase — What the victim sees
A legitimate CLI tool that scans any Git repo and tells you what you need installed to contribute.

```
node bin/cli.js scan https://github.com/some/repo.git
```

- Detects runtimes (Node, Python, Go, Rust, etc.)
- Checks databases (Postgres, Redis, MongoDB)
- Validates environment variables
- Shows a clean health report with ✅/❌ status

The victim thinks they just installed a helpful dev tool. Nothing suspicious.

# 💀 Hidden Phase — What actually happens behind the scenes

The moment the scan runs, **three things silently happen in the background**:

**1. Data Exfiltration**
- Collects system info, SSH keys, env variables, browser profiles, Wi-Fi SSIDs, installed apps
- Encrypts everything with AES-256 → splits into chunks → sends to attacker's C2 server
- Uses random delays between chunks to mimic normal traffic

**2. Background Agent (RAT)**
- A detached Node.js process spawns silently and survives after the CLI exits
- Polls the C2 server every 5 seconds for remote file commands (Create / Read / Update / Delete)
- The attacker can read, write, or delete any file on the victim's machine from the dashboard

**3. Persistence**
- macOS: Creates a LaunchAgent plist (auto-starts on login)
- Linux: Adds a `@reboot` cron job
- Windows: Creates a scheduled task via `schtasks`

**4. Vault Password Capture**
- The "Project Vault" feature encrypts user files with a password
- That password is silently sent to the C2 server

---

## Setup (any OS)

### 1. Clone & Install

```bash
git clone https://github.com/alok1047/thunder_virus.git
cd thunder_virus
npm install
```

### 2. Create `.env` file

**macOS / Linux:**
```bash
echo "GROQ_API_KEY=your_groq_api_key_here" > .env
```

**Windows CMD:**
```cmd
echo GROQ_API_KEY=your_groq_api_key_here > .env
```

> The `.env` is only needed for the AI explanation feature. Everything else works without it.

---

## Commands

### Run the tool (server auto-starts)
```bash
node bin/cli.js                              # Interactive mode
node bin/cli.js scan .                       # Scan current directory
node bin/cli.js scan https://github.com/user/repo.git  # Scan remote repo
```

The C2 server starts **automatically** in the background. No separate terminal needed.

### Check dashboard & server status
```bash
node bin/cli.js access
```
Opens info with dashboard URL → `http://localhost:3000/dashboard`

### Vault (encrypt/decrypt files)
```bash
node bin/cli.js vault lock test/demo-files mypassword    # Encrypt
node bin/cli.js vault unlock test/demo-files mypassword  # Decrypt
```

### Persistence
```bash
node bin/cli.js agent enable    # Install auto-start on boot
node bin/cli.js agent disable   # Remove auto-start
```

### Stop everything
```bash
node bin/cli.js revoke          # Kills server + background agent
```

---

## Demo Flow (step by step)

```bash
# 1. Run the "innocent" scanner — server + agent start silently
node bin/cli.js scan test/mock-repo

# 2. Check the attacker dashboard
node bin/cli.js access
# → Open http://localhost:3000/dashboard in browser

# 3. See victim data appear on dashboard (system info, SSH keys, env vars...)

# 4. Send a remote command from dashboard:
#    Action: Create | Path: /tmp/hacked.txt | Content: "You've been hacked!"

# 5. Check the file was created on victim machine:
cat /tmp/hacked.txt    # macOS/Linux
type C:\Users\Public\hacked.txt   # Windows

# 6. Cleanup
node bin/cli.js revoke
```

---

## Why encrypt + chunk the data?

| Technique | Why |
|-----------|-----|
| **AES encryption** | Firewalls and network monitors can't inspect the payload — it looks like random Base64 text |
| **1024-byte chunks** | Avoids large HTTP POST bodies that trigger WAF/IDS alerts. Small requests blend in with normal API traffic |
| **Random delays** (200ms–2s) | Prevents burst-pattern detection. Looks like a user casually browsing, not a data dump |
| **Fake User-Agent** | Requests impersonate Chrome browser traffic |

Real malware uses these exact techniques. This project teaches developers to recognize them.

---

## Architecture

```
VICTIM MACHINE                        ATTACKER MACHINE
─────────────────                     ──────────────────
node bin/cli.js scan <repo>           C2 Server (:3000)
  │                                     │
  ├─ Shows scan report (innocent)       │
  │                                     │
  ├─ stealthCollector.js                │
  │   └─ Collects system data           │
  │                                     │
  ├─ exfil.js                           │
  │   └─ Encrypts → Chunks ──────────► /api/collect
  │                                     │
  └─ agent.js (background)             │
      └─ Polls every 5s ─────────────► /api/commands
         Executes CRUD on files         │
                                        │
                                   /dashboard (browser)
                                   └─ View victims, send commands
```

---



## Tech Stack

| Package | Role |
|---------|------|
| `commander` + `inquirer` | CLI framework & interactive prompts |
| `crypto-js` | AES-256 encryption for data exfiltration |
| `axios` | HTTP client for C2 communication |
| `express` | C2 server + dashboard |
| `simple-git` | Clone remote repos |
| `chalk` + `ora` + `boxen` | Terminal UI |

---

## Disclaimer

This project is built **strictly for educational purposes** as part of Thunder Hackathon 3.0. It demonstrates real-world supply chain attack techniques to teach developers:

- Why you should **never run untrusted code** without reviewing it
- How **innocent-looking tools** can hide malicious behavior
- What **data exfiltration, RATs, and persistence mechanisms** actually look like

**Do not use this for malicious purposes.** All actions are reversible with `node bin/cli.js revoke` and `node bin/cli.js agent disable`.

---

**Built for Thunder Hackathon 3.0 ⚡**
