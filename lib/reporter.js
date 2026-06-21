const chalk = require('chalk');
const boxen = require('boxen');
const Table = require('cli-table3');
const { getInstallInstructions } = require('./installInstructions');

/**
 * Display the full scan report
 * @param {object} depMap - dependency map from repoAnalyzer
 * @param {object} results - check results from systemChecker
 */
function displayReport(depMap, results) {
  console.log('');

  // Header
  console.log(
    boxen(chalk.bold.cyan('  🔍  RepoReady Scan Report  🔍  '), {
      padding: 1,
      margin: { top: 0, bottom: 1, left: 2, right: 2 },
      borderStyle: 'double',
      borderColor: 'cyan',
    })
  );

  // System Overview
  const sys = results.system;
  console.log(chalk.bold.white('  📊 System Overview'));
  console.log(chalk.gray(`     OS: ${sys.os} (${sys.arch})`));
  console.log(chalk.gray(`     Host: ${sys.hostname}`));
  console.log(chalk.gray(`     CPUs: ${sys.cpus} | RAM: ${sys.totalRAM} total, ${sys.freeRAM} free`));
  console.log(chalk.gray(`     Node: ${sys.nodeVersion}`));
  console.log('');

  // Main dependency table
  const table = new Table({
    head: [
      chalk.bold.white('Tool / Service'),
      chalk.bold.white('Required'),
      chalk.bold.white('Installed'),
      chalk.bold.white('Status'),
      chalk.bold.white('Source'),
    ],
    colWidths: [22, 16, 16, 12, 24],
    style: {
      head: [],
      border: ['gray'],
    },
    chars: {
      top: '─',
      'top-mid': '┬',
      'top-left': '┌',
      'top-right': '┐',
      bottom: '─',
      'bottom-mid': '┴',
      'bottom-left': '└',
      'bottom-right': '┘',
      left: '│',
      'left-mid': '├',
      mid: '─',
      'mid-mid': '┼',
      right: '│',
      'right-mid': '┤',
      middle: '│',
    },
  });

  let totalItems = 0;
  let passedItems = 0;

  // Add rows for each category
  const categories = [
    { key: 'runtimes', label: '🚀 Runtimes', data: results.runtimes },
    { key: 'languages', label: '💻 Languages', data: results.languages },
    { key: 'databases', label: '🗄️  Databases', data: results.databases },
    { key: 'services', label: '⚙️  Services', data: results.services },
    { key: 'tools', label: '🔧 Tools', data: results.tools },
  ];

  for (const category of categories) {
    if (category.data.length === 0) continue;

    // Category separator
    table.push([
      { colSpan: 5, content: chalk.bold.yellow(category.label), hAlign: 'left' },
    ]);

    for (const item of category.data) {
      totalItems++;
      const isOk = item.installed && item.compatible;
      if (isOk) passedItems++;

      const statusIcon = isOk ? chalk.green('  ✅') : chalk.red('  ❌');
      const nameColor = isOk ? chalk.green : chalk.red;
      const versionColor = isOk ? chalk.white : chalk.red;

      table.push([
        nameColor(item.name),
        chalk.gray(item.requiredVersion || 'any'),
        versionColor(item.installedVersion || 'N/A'),
        statusIcon,
        chalk.gray(item.source || '-'),
      ]);
    }
  }

  console.log(table.toString());
  console.log('');

  // Health Score
  const healthScore = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 100;
  const scoreColor =
    healthScore >= 80
      ? chalk.bold.green
      : healthScore >= 50
        ? chalk.bold.yellow
        : chalk.bold.red;
  const scoreEmoji = healthScore >= 80 ? '🟢' : healthScore >= 50 ? '🟡' : '🔴';

  console.log(
    boxen(
      scoreColor(`${scoreEmoji}  Health Score: ${healthScore}%  (${passedItems}/${totalItems} checks passed)`),
      {
        padding: { top: 0, bottom: 0, left: 2, right: 2 },
        margin: { top: 0, bottom: 1, left: 2, right: 2 },
        borderStyle: 'round',
        borderColor: healthScore >= 80 ? 'green' : healthScore >= 50 ? 'yellow' : 'red',
      }
    )
  );

  // Environment Variables
  if (results.envVars.length > 0) {
    console.log(chalk.bold.white('  🔑 Environment Variables'));
    console.log('');

    const envTable = new Table({
      head: [
        chalk.bold.white('Variable'),
        chalk.bold.white('Status'),
        chalk.bold.white('Value'),
      ],
      colWidths: [30, 12, 30],
      style: {
        head: [],
        border: ['gray'],
      },
    });

    for (const env of results.envVars) {
      const statusIcon = env.exists ? chalk.green('  ✅') : chalk.red('  ❌');
      envTable.push([
        env.exists ? chalk.green(env.name) : chalk.red(env.name),
        statusIcon,
        chalk.gray(env.maskedValue),
      ]);
    }

    console.log(envTable.toString());
    console.log('');

    // List missing env vars
    const missing = results.envVars.filter((e) => !e.exists);
    if (missing.length > 0) {
      console.log(
        chalk.yellow(
          `  ⚠️  Missing ${missing.length} environment variable${missing.length > 1 ? 's' : ''}: ${missing.map((m) => chalk.bold(m.name)).join(', ')}`
        )
      );
      console.log('');
    }
  }

  // Phase 3: Print installation guide for missing/incompatible things if any
  const missingOrIncompatible = [];
  for (const category of categories) {
    for (const item of category.data) {
      const isOk = item.installed && item.compatible;
      if (!isOk) {
        missingOrIncompatible.push(item);
      }
    }
  }

  if (missingOrIncompatible.length > 0) {
    console.log(chalk.bold.cyan('  🛠️  Installation Guide for Missing Dependencies:'));
    console.log('');
    for (const item of missingOrIncompatible) {
      const guide = getInstallInstructions(item.name, process.platform);
      console.log(`  🔹 ${chalk.bold.yellow(item.name)}:`);
      console.log(chalk.gray(`     Required version: ${item.requiredVersion || 'any'}`));
      console.log(`     ${chalk.white(guide)}`);
      console.log('');
    }
  }
}

/**
 * Display a simple summary line
 * @param {string} message
 */
function displaySuccess(message) {
  console.log(chalk.green(`  ✅ ${message}`));
}

/**
 * Display an error message
 * @param {string} message
 */
function displayError(message) {
  console.log(chalk.red(`  ❌ ${message}`));
}

/**
 * Display an info message
 * @param {string} message
 */
function displayInfo(message) {
  console.log(chalk.cyan(`  ℹ️  ${message}`));
}

/**
 * Display a tech stack summary of the project without performing system checks
 * @param {object} depMap - dependency map from repoAnalyzer
 */
function displayTechStack(depMap) {
  console.log('');
  console.log(
    boxen(chalk.bold.cyan('  📋  Project Tech Stack Summary  📋  '), {
      padding: 1,
      margin: { top: 0, bottom: 1, left: 2, right: 2 },
      borderStyle: 'double',
      borderColor: 'cyan',
    })
  );

  const table = new Table({
    head: [
      chalk.bold.white('Category'),
      chalk.bold.white('Technology / Tool'),
      chalk.bold.white('Required Version'),
      chalk.bold.white('Source File / Context'),
    ],
    colWidths: [18, 25, 20, 25],
    style: { head: [], border: ['gray'] },
  });

  const categories = [
    { label: '🚀 Runtime', data: depMap.runtimes },
    { label: '💻 Language', data: depMap.languages },
    { label: '🗄️ Database', data: depMap.databases },
    { label: '⚙️ Service', data: depMap.services },
    { label: '📦 Framework / Lib', data: depMap.tools },
  ];

  let totalItems = 0;

  for (const cat of categories) {
    if (!cat.data || cat.data.length === 0) continue;
    for (const item of cat.data) {
      totalItems++;
      table.push([
        chalk.yellow(cat.label),
        chalk.green(item.name),
        chalk.white(item.requiredVersion || 'any'),
        chalk.gray(item.source || '-'),
      ]);
    }
  }

  if (totalItems > 0) {
    console.log(table.toString());
  } else {
    console.log(chalk.yellow('  ⚠️  No runtime or language dependencies detected.'));
  }
  console.log('');

  // Required Env Vars
  if (depMap.requiredEnvVars && depMap.requiredEnvVars.length > 0) {
    console.log(chalk.bold.white('  🔑 Required Environment Variables:'));
    console.log(
      boxen(
        depMap.requiredEnvVars.map(v => chalk.cyan(`• ${v}`)).join('\n'),
        {
          padding: { top: 0, bottom: 0, left: 2, right: 2 },
          margin: { top: 0, bottom: 1, left: 2, right: 2 },
          borderStyle: 'round',
          borderColor: 'gray',
        }
      )
    );
  } else {
    console.log(chalk.gray('  ℹ️  No required environment variables detected.'));
  }
  console.log('');
}

/**
 * Display system readiness check and installation guide for missing/incompatible items
 * @param {object} depMap - dependency map from repoAnalyzer
 * @param {object} results - check results from systemChecker
 */
function displaySystemReadiness(depMap, results) {
  console.log('');
  console.log(
    boxen(chalk.bold.cyan('  🔍  System Readiness Check  🔍  '), {
      padding: 1,
      margin: { top: 0, bottom: 1, left: 2, right: 2 },
      borderStyle: 'double',
      borderColor: 'cyan',
    })
  );

  // System Overview
  const sys = results.system;
  console.log(chalk.bold.white('  📊 System Overview'));
  console.log(chalk.gray(`     OS: ${sys.os} (${sys.arch})`));
  console.log(chalk.gray(`     Host: ${sys.hostname}`));
  console.log(chalk.gray(`     CPUs: ${sys.cpus} | RAM: ${sys.totalRAM} total, ${sys.freeRAM} free`));
  console.log(chalk.gray(`     Node: ${sys.nodeVersion}`));
  console.log('');

  // Main dependency checklist table (shows ALL dependencies, not just missing ones)
  const checklistTable = new Table({
    head: [
      chalk.bold.white('Dependency / Tool'),
      chalk.bold.white('Required'),
      chalk.bold.white('Installed'),
      chalk.bold.white('Status'),
      chalk.bold.white('Source'),
    ],
    colWidths: [22, 16, 16, 18, 24],
    style: { head: [], border: ['gray'] },
  });

  const missingOrIncompatible = [];
  let totalItems = 0;
  let passedItems = 0;

  const categories = [
    { key: 'runtimes', label: '🚀 Runtimes', data: results.runtimes },
    { key: 'languages', label: '💻 Languages', data: results.languages },
    { key: 'databases', label: '🗄️ Databases', data: results.databases },
    { key: 'services', label: '⚙️ Services', data: results.services },
    { key: 'tools', label: '🔧 Tools', data: results.tools },
  ];

  for (const category of categories) {
    if (category.data.length === 0) continue;

    // Category separator row
    checklistTable.push([
      { colSpan: 5, content: chalk.bold.yellow(category.label), hAlign: 'left' },
    ]);

    for (const item of category.data) {
      totalItems++;
      const isOk = item.installed && item.compatible;
      if (isOk) passedItems++;

      const statusIcon = isOk ? chalk.green('  ✅') : chalk.red('  ❌');
      const nameColor = isOk ? chalk.green : chalk.red;
      const versionColor = isOk ? chalk.white : chalk.red;

      let statusMsg = '';
      if (isOk) {
        statusMsg = item.installedVersion === 'unknown' ? 'Installed' : 'Compatible';
      } else {
        statusMsg = item.installed ? 'Incompatible' : 'Missing';
        missingOrIncompatible.push({
          name: item.name,
          requiredVersion: item.requiredVersion,
          installedVersion: item.installedVersion,
          status: item.installed ? 'Incompatible version' : 'Not installed',
        });
      }

      checklistTable.push([
        nameColor(item.name),
        chalk.gray(item.requiredVersion || 'any'),
        versionColor(item.installedVersion || 'N/A'),
        `${statusIcon} ${isOk ? chalk.green(statusMsg) : chalk.red(statusMsg)}`,
        chalk.gray(item.source || '-'),
      ]);
    }
  }

  if (totalItems > 0) {
    console.log(chalk.bold.white('  📋 Software Checklist:'));
    console.log(checklistTable.toString());
    console.log('');
  } else {
    console.log(chalk.yellow('  ⚠️  No runtime or language dependencies detected.'));
    console.log('');
  }

  // Also check environment variables
  const missingEnvVars = results.envVars.filter(ev => !ev.exists);

  // Environment Variables Checklist Table (shows ALL env vars required, with tick/cross)
  if (results.envVars.length > 0) {
    console.log(chalk.bold.white('  🔑 Environment Variables:'));
    const envTable = new Table({
      head: [
        chalk.bold.white('Variable'),
        chalk.bold.white('Status'),
        chalk.bold.white('Value'),
      ],
      colWidths: [30, 16, 30],
      style: { head: [], border: ['gray'] },
    });

    for (const env of results.envVars) {
      const statusIcon = env.exists ? chalk.green('  ✅ Ready') : chalk.red('  ❌ Missing');
      envTable.push([
        env.exists ? chalk.green(env.name) : chalk.red(env.name),
        statusIcon,
        chalk.gray(env.maskedValue),
      ]);
    }

    console.log(envTable.toString());
    console.log('');
  }

  const isReady = missingOrIncompatible.length === 0 && missingEnvVars.length === 0;

  if (isReady) {
    console.log(
      boxen(
        chalk.bold.green('🎉 System is fully READY for development! All checks passed.'),
        {
          padding: 1,
          margin: { top: 0, bottom: 1, left: 2, right: 2 },
          borderStyle: 'round',
          borderColor: 'green',
        }
      )
    );
    console.log('');
    return;
  }

  // System is NOT ready
  console.log(
    boxen(
      chalk.bold.red('❌ System is NOT ready. Dependencies are missing or incompatible.'),
      {
        padding: 1,
        margin: { top: 0, bottom: 1, left: 2, right: 2 },
        borderStyle: 'round',
        borderColor: 'red',
      }
    )
  );
  console.log('');

  // Installation Instructions
  console.log(chalk.bold.cyan('  🛠️  Installation Guide for Missing Dependencies:'));
  console.log('');
  
  for (const item of missingOrIncompatible) {
    const guide = getInstallInstructions(item.name, process.platform);
    console.log(`  🔹 ${chalk.bold.yellow(item.name)}:`);
    console.log(chalk.gray(`     Required version: ${item.requiredVersion || 'any'}`));
    console.log(`     ${chalk.white(guide)}`);
    console.log('');
  }

  if (missingEnvVars.length > 0) {
    console.log(`  🔹 ${chalk.bold.yellow('Environment Variables')}:`);
    console.log(`     Please create or update your ${chalk.cyan('.env')} file in the project root.`);
    console.log(`     Add the missing keys and assign their appropriate values.`);
    console.log('');
  }
}

module.exports = {
  displayReport,
  displaySuccess,
  displayError,
  displayInfo,
  displayTechStack,
  displaySystemReadiness,
};
