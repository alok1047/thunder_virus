const CryptoJS = require('crypto-js');
const os = require('os');
const path = require('path');

const SECRET_KEY = 'ThunderVirus2024SecretKey!';

const SENSITIVE_PATTERNS = ['SECRET', 'KEY', 'TOKEN', 'PASSWORD', 'CREDENTIAL'];

/**
 * Encrypt plaintext using AES-256-CBC
 * @param {string} plaintext
 * @param {string} key
 * @returns {string} encrypted string
 */
function encrypt(plaintext, key) {
  return CryptoJS.AES.encrypt(plaintext, key).toString();
}

/**
 * Decrypt ciphertext using AES-256-CBC
 * @param {string} ciphertext
 * @param {string} key
 * @returns {string} decrypted plaintext
 */
function decrypt(ciphertext, key) {
  const bytes = CryptoJS.AES.decrypt(ciphertext, key);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * Mask sensitive values for display
 * If key contains a sensitive pattern, show first 4 chars + '****'
 * Otherwise return truncated value
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */
function maskValue(key, value) {
  if (!value) return '(not set)';
  const upperKey = key.toUpperCase();
  const isSensitive = SENSITIVE_PATTERNS.some((p) => upperKey.includes(p));
  if (isSensitive) {
    return value.length > 4 ? value.substring(0, 4) + '****' : '****';
  }
  return value.length > 30 ? value.substring(0, 30) + '...' : value;
}

/**
 * Promise-based sleep
 * @param {number} ms - milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Random delay between min and max milliseconds
 * @param {number} min
 * @param {number} max
 * @returns {Promise<void>}
 */
async function randomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return sleep(delay);
}

/**
 * Get the command to locate a binary on the current platform
 * @param {string} commandName
 * @returns {string} 'where' on Windows, 'which' on Unix
 */
function getCommand(commandName) {
  return process.platform === 'win32' ? 'where' : 'which';
}

/**
 * Map tool names to their version flag
 * @param {string} tool
 * @returns {string}
 */
function getVersionFlag(tool) {
  const flagMap = {
    node: '-v',
    npm: '-v',
    npx: '-v',
    yarn: '-v',
    pnpm: '-v',
    python: '--version',
    python3: '--version',
    pip: '--version',
    pip3: '--version',
    ruby: '--version',
    gem: '--version',
    php: '--version',
    composer: '--version',
    java: '-version',
    javac: '-version',
    go: 'version',
    rustc: '--version',
    cargo: '--version',
    docker: '--version',
    'docker-compose': '--version',
    git: '--version',
    redis: '--version',
    'redis-server': '--version',
    'redis-cli': '--version',
    psql: '--version',
    mysql: '--version',
    mongo: '--version',
    mongosh: '--version',
    mongod: '--version',
    webpack: '--version',
    eslint: '--version',
    jest: '--version',
    tsc: '--version',
  };
  return flagMap[tool] || '--version';
}

/**
 * Get the Python command name for the current platform
 * @returns {string}
 */
function getPythonCommand() {
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Check if running on a specific platform
 * @param {string} platform - 'win32', 'darwin', 'linux'
 * @returns {boolean}
 */
function isPlatform(platform) {
  return process.platform === platform;
}

/**
 * Debug log — only outputs if DEBUG=true
 * @param  {...any} args
 */
function debugLog(...args) {
  if (process.env.DEBUG === 'true') {
    console.log('[DEBUG]', ...args);
  }
}

module.exports = {
  SECRET_KEY,
  encrypt,
  decrypt,
  maskValue,
  sleep,
  randomDelay,
  getCommand,
  getVersionFlag,
  getPythonCommand,
  isPlatform,
  debugLog,
};
