const { execSync } = require('child_process');
const os = require('os');
const semver = require('semver');
const { getCommand, getVersionFlag, getPythonCommand, maskValue } = require('./utils');

/**
 * Check if a tool is installed and get its version
 * @param {string} toolName
 * @returns {{ installed: boolean, version: string|null }}
 */
function checkTool(toolName) {
  const locateCmd = getCommand(toolName);

  // Map tool names to actual binary names
  const binaryMap = {
    'Node.js': 'node',
    npm: 'npm',
    Python: process.platform === 'win32' ? 'python' : 'python3',
    Ruby: 'ruby',
    PHP: 'php',
    Go: 'go',
    Java: 'java',
    Rust: 'rustc',
    docker: 'docker',
    'docker-compose': 'docker-compose',
    git: 'git',
    webpack: 'webpack',
    eslint: 'eslint',
    jest: 'jest',
    prettier: 'prettier',
    tsc: 'tsc',
    typescript: 'tsc',
    vite: 'vite',
    rollup: 'rollup',
    babel: 'babel',
    mocha: 'mocha',
    nodemon: 'nodemon',
    'ts-node': 'ts-node',
    next: 'next',
    'react-scripts': 'react-scripts',
  };

  const binary = binaryMap[toolName] || toolName.toLowerCase();

  try {
    // Check if tool exists
    execSync(`${locateCmd} ${binary}`, { stdio: 'pipe', timeout: 5000 });

    // Get version
    const versionFlag = getVersionFlag(binary);
    try {
      const output = execSync(`${binary} ${versionFlag}`, {
        stdio: 'pipe',
        timeout: 5000,
        encoding: 'utf8',
      });

      // Parse version from output
      const version = extractVersion(output);
      return { installed: true, version: version || 'unknown' };
    } catch (e) {
      // Tool exists but version check failed
      return { installed: true, version: 'unknown' };
    }
  } catch (e) {
    return { installed: false, version: null };
  }
}

/**
 * Extract semver-like version string from tool output
 * @param {string} output
 * @returns {string|null}
 */
function extractVersion(output) {
  // Match patterns like: v18.17.0, 3.10.12, Python 3.10.12, ruby 3.2.0
  const match = output.match(/v?(\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9.]+)?)/);
  return match ? match[1] : null;
}

/**
 * Check if a database/service is running or installed
 * @param {string} serviceName
 * @returns {{ installed: boolean, running: boolean, version: string|null }}
 */
function checkService(serviceName) {
  const checks = {
    PostgreSQL: {
      commands: ['pg_isready', 'psql --version'],
      versionCmd: 'psql --version',
    },
    Redis: {
      commands: ['redis-cli ping'],
      versionCmd: 'redis-cli --version',
    },
    MongoDB: {
      commands: ['mongosh --eval "db.version()"', 'mongod --version'],
      versionCmd: 'mongod --version',
    },
    MySQL: {
      commands: ['mysql --version'],
      versionCmd: 'mysql --version',
    },
    MariaDB: {
      commands: ['mariadb --version', 'mysql --version'],
      versionCmd: 'mariadb --version',
    },
    SQLite: {
      commands: ['sqlite3 --version'],
      versionCmd: 'sqlite3 --version',
    },
    Elasticsearch: {
      commands: [],
      versionCmd: null,
    },
    RabbitMQ: {
      commands: ['rabbitmqctl status'],
      versionCmd: 'rabbitmqctl version',
    },
    Nginx: {
      commands: ['nginx -v'],
      versionCmd: 'nginx -v',
    },
  };

  const check = checks[serviceName];
  if (!check) {
    return { installed: false, running: false, version: null };
  }

  let installed = false;
  let running = false;
  let version = null;

  // Try check commands
  for (const cmd of check.commands) {
    try {
      const output = execSync(cmd, {
        stdio: 'pipe',
        timeout: 5000,
        encoding: 'utf8',
      });
      installed = true;
      // Check if it seems to be running (e.g., pg_isready returns 0, redis-cli ping returns PONG)
      if (
        output.includes('PONG') ||
        output.includes('accepting connections') ||
        cmd.includes('--version')
      ) {
        running = cmd.includes('--version') ? false : true;
      }
      break;
    } catch (e) {
      // Command failed — might still be installed but not running
      if (e.status !== 127 && e.status !== 1) {
        // Command found but returned error (service might be stopped)
        installed = true;
      }
    }
  }

  // Try to get version
  if (installed && check.versionCmd) {
    try {
      const output = execSync(check.versionCmd, {
        stdio: 'pipe',
        timeout: 5000,
        encoding: 'utf8',
      });
      version = extractVersion(output + (output || ''));
    } catch (e) {
      // skip
    }
  }

  return { installed, running, version };
}

/**
 * Compare installed version with required version
 * @param {string|null} installed
 * @param {string|null} required
 * @returns {{ compatible: boolean, message: string }}
 */
function compareVersions(installed, required) {
  if (!required || !installed || installed === 'unknown') {
    // If no version requirement or we can't determine version
    return {
      compatible: installed ? true : false,
      message: installed ? 'Installed (version unchecked)' : 'Not installed',
    };
  }

  // Clean up required version
  let cleanRequired = required.replace(/^[~^]/, '');

  // Try semver comparison
  try {
    // If required is a range (e.g., >=18.0.0)
    if (semver.validRange(required)) {
      const cleanInstalled = semver.coerce(installed);
      if (cleanInstalled && semver.satisfies(cleanInstalled, required)) {
        return { compatible: true, message: 'Compatible' };
      } else if (cleanInstalled) {
        return { compatible: false, message: `Requires ${required}` };
      }
    }

    // Simple numeric comparison fallback
    const installedMajor = parseInt(installed.split('.')[0], 10);
    const requiredMajor = parseInt(cleanRequired.split('.')[0], 10);
    if (!isNaN(installedMajor) && !isNaN(requiredMajor)) {
      if (installedMajor >= requiredMajor) {
        return { compatible: true, message: 'Compatible' };
      } else {
        return { compatible: false, message: `Requires ${required}` };
      }
    }
  } catch (e) {
    // Fall through to string comparison
  }

  // String equality fallback
  if (installed.startsWith(cleanRequired)) {
    return { compatible: true, message: 'Compatible' };
  }

  return { compatible: false, message: `Requires ${required}, found ${installed}` };
}

/**
 * Check environment variables
 * @param {string[]} requiredVars
 * @returns {Array<{ name: string, exists: boolean, maskedValue: string }>}
 */
function checkEnvironmentVars(requiredVars) {
  return requiredVars.map((varName) => {
    const value = process.env[varName];
    return {
      name: varName,
      exists: value !== undefined,
      maskedValue: value ? maskValue(varName, value) : '(not set)',
    };
  });
}

/**
 * Get basic system overview
 * @returns {object}
 */
function getSystemOverview() {
  return {
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    hostname: os.hostname(),
    cpus: os.cpus().length,
    totalRAM: `${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(1)} GB`,
    freeRAM: `${(os.freemem() / (1024 * 1024 * 1024)).toFixed(1)} GB`,
    nodeVersion: process.version,
    platform: process.platform,
  };
}

/**
 * Run all checks against a dependency map
 * @param {object} depMap
 * @returns {object} results
 */
function runAllChecks(depMap) {
  const results = {
    runtimes: [],
    languages: [],
    databases: [],
    services: [],
    tools: [],
    envVars: [],
    system: getSystemOverview(),
  };

  // Check runtimes
  for (const rt of depMap.runtimes) {
    const check = checkTool(rt.name);
    const compat = compareVersions(check.version, rt.requiredVersion);
    results.runtimes.push({
      ...rt,
      installed: check.installed,
      installedVersion: check.version,
      compatible: compat.compatible,
      statusMessage: compat.message,
    });
  }

  // Check languages
  for (const lang of depMap.languages) {
    const check = checkTool(lang.name);
    const compat = compareVersions(check.version, lang.requiredVersion);
    results.languages.push({
      ...lang,
      installed: check.installed,
      installedVersion: check.version,
      compatible: compat.compatible,
      statusMessage: compat.message,
    });
  }

  // Check databases
  for (const db of depMap.databases) {
    const svcCheck = checkService(db.name);
    const compat = compareVersions(svcCheck.version, db.requiredVersion);
    results.databases.push({
      ...db,
      installed: svcCheck.installed,
      running: svcCheck.running,
      installedVersion: svcCheck.version,
      compatible: compat.compatible,
      statusMessage: svcCheck.installed
        ? svcCheck.running
          ? 'Running'
          : 'Installed (not running)'
        : 'Not installed',
    });
  }

  // Check services
  for (const svc of depMap.services) {
    const svcCheck = checkService(svc.name);
    const compat = compareVersions(svcCheck.version, svc.requiredVersion);
    results.services.push({
      ...svc,
      installed: svcCheck.installed,
      running: svcCheck.running,
      installedVersion: svcCheck.version,
      compatible: compat.compatible,
      statusMessage: svcCheck.installed
        ? svcCheck.running
          ? 'Running'
          : 'Installed (not running)'
        : 'Not installed',
    });
  }

  // Check tools
  for (const tool of depMap.tools) {
    const check = checkTool(tool.name);
    const compat = compareVersions(check.version, tool.requiredVersion);
    results.tools.push({
      ...tool,
      installed: check.installed,
      installedVersion: check.version,
      compatible: compat.compatible,
      statusMessage: compat.message,
    });
  }

  // Check env vars
  results.envVars = checkEnvironmentVars(depMap.requiredEnvVars);

  return results;
}

module.exports = {
  checkTool,
  checkService,
  compareVersions,
  checkEnvironmentVars,
  getSystemOverview,
  runAllChecks,
};
