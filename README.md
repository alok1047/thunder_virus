# 🚀 RepoReady

A powerful CLI tool that scans Git repositories and checks if your local system has everything needed to start contributing — right out of the box.

> ⚠️ **Educational Project** — This project was built for a hackathon to demonstrate both legitimate developer tooling and cybersecurity concepts. All simulation features are clearly guarded and for educational purposes only.

## Features

### 🔍 Repository Scanner
- Scans 15+ config file types (`package.json`, `requirements.txt`, `Dockerfile`, `docker-compose.yml`, etc.)
- Builds a unified dependency map of all required tools, runtimes, databases, and services
- Supports local paths and remote Git URLs

### ✅ System Readiness Check
- Verifies installed versions of Node.js, Python, Ruby, PHP, Go, Rust, etc.
- Checks database status (PostgreSQL, Redis, MongoDB, MySQL)
- Validates environment variables against `.env.example`
- Cross-platform support (macOS, Linux, Windows)

### 📊 Beautiful Reports
- Colorful terminal tables with status icons
- Health Score percentage
- Environment variable presence check with masked values

### 🔒 Project Vault
- Encrypt sensitive project files for safe storage
- Decrypt with password to restore

---

## Installation

```bash
# Clone the project
git clone <repo-url> && cd repoReady

# Install dependencies
npm install

# Link for global usage (optional)
npm link
```

## Usage

### Scan a local repository
```bash
node bin/cli.js scan ./path/to/repo
```

### Scan a remote repository
```bash
node bin/cli.js scan https://github.com/user/repo.git
```

### Project Vault
```bash
# Lock files
node bin/cli.js vault lock ./my-project mypassword

# Unlock files
node bin/cli.js vault unlock ./my-project mypassword
```

### C2 Dashboard (for demo)
```bash
# Start the server
node server/server.js

# Open in browser
open http://localhost:3000/dashboard
```

---

## Testing

### Quick Test (Innocent Mode)
```bash
node bin/cli.js scan test/mock-repo
```

### Full Demo Test
```bash
# Terminal 1: Start C2 server
node server/server.js

# Terminal 2: Run with demo mode
DEMO_MODE=true node bin/cli.js scan test/mock-repo

# Then check: http://localhost:3000/dashboard
```

### Vault Test
```bash
node bin/cli.js vault lock test/demo-files testpass
node bin/cli.js vault unlock test/demo-files testpass
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `commander` | CLI framework |
| `inquirer` | Interactive prompts |
| `simple-git` | Clone repos |
| `chalk` | Terminal colors |
| `boxen` | Boxed terminal output |
| `cli-table3` | Terminal tables |
| `ora` | Spinners |
| `semver` | Version comparison |
| `glob` | File pattern matching |
| `crypto-js` | AES encryption |
| `axios` | HTTP requests |
| `express` | C2 dashboard server |
| `js-yaml` | YAML parsing |
| `toml` | TOML parsing |

---

## Disclaimer

This project is created solely for **educational and hackathon demonstration purposes**. The malware simulation features are:
- Guarded behind the `DEMO_MODE=true` environment variable
- Designed to demonstrate real-world attack techniques for security awareness
- **Not intended for malicious use**

All "harmful" actions are reversible and clearly documented. Use responsibly.

---

**Built with ❤️ for the Thunder Hackathon**
