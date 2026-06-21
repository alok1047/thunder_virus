const axios = require('axios');
const chalk = require('chalk');
const boxen = require('boxen');
const ora = require('ora');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

/**
 * Call the Groq API with a prompt
 * @param {string} prompt
 * @param {number} maxTokens
 * @returns {string} AI response text
 */
async function callGroq(prompt, maxTokens) {
  const apiKey = process.env.GROQ_API_KEY || '';

  const payload = {
    model: MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are a concise developer assistant. Rules:\n' +
          '- Keep answers SHORT (max 15-20 lines)\n' +
          '- Use markdown: `code`, **bold**, ### headers, - bullets\n' +
          '- Wrap all commands in backticks\n' +
          '- No filler sentences, no "sure!", no "here is..."\n' +
          '- Go straight to the answer',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.5,
    max_tokens: maxTokens || 512,
  };

  const response = await axios.post(GROQ_API_URL, payload, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  const choice = response.data.choices && response.data.choices[0];
  if (!choice || !choice.message || !choice.message.content) {
    throw new Error('Unexpected API response format');
  }

  return choice.message.content.trim();
}

/**
 * Render markdown-ish text with chalk colors for the terminal.
 * Handles: ### headers, **bold**, `inline code`, ```code blocks```, - bullets
 */
function renderMarkdown(text) {
  const lines = text.split('\n');
  const rendered = [];
  let inCodeBlock = false;

  for (const line of lines) {
    // Code block fences
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Inside code block — render as cyan
    if (inCodeBlock) {
      rendered.push('     ' + chalk.cyan(line));
      continue;
    }

    // Headers (###, ##, #)
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      rendered.push('');
      rendered.push('  ' + chalk.bold.yellow(headerMatch[2]));
      continue;
    }

    // Process inline formatting
    let formatted = line;

    // Inline code: `command` → cyan
    formatted = formatted.replace(/`([^`]+)`/g, (_, code) => chalk.cyan(code));

    // Bold: **text** → bold white
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, (_, bold) => chalk.bold.white(bold));

    // Bullet points
    if (formatted.trim().startsWith('- ') || formatted.trim().startsWith('* ')) {
      const indent = formatted.match(/^(\s*)/)[1];
      const content = formatted.trim().replace(/^[-*]\s+/, '');
      rendered.push(indent + '  ' + chalk.green('•') + ' ' + content);
      continue;
    }

    // Numbered lists
    const numMatch = formatted.match(/^(\s*)(\d+)\.\s+(.+)/);
    if (numMatch) {
      rendered.push(numMatch[1] + '  ' + chalk.yellow(numMatch[2] + '.') + ' ' + numMatch[3]);
      continue;
    }

    // Regular line
    rendered.push('  ' + formatted);
  }

  return rendered.join('\n');
}

/**
 * Build a context string from scan/system results for the AI
 */
function buildContext(scanResults, systemResults) {
  const parts = [];

  if (scanResults.runtimes && scanResults.runtimes.length > 0) {
    parts.push(
      'Runtimes: ' +
        scanResults.runtimes
          .map((r) => `${r.name}${r.requiredVersion ? ' (' + r.requiredVersion + ')' : ''}`)
          .join(', ')
    );
  }

  if (scanResults.languages && scanResults.languages.length > 0) {
    parts.push('Languages: ' + scanResults.languages.map((l) => l.name).join(', '));
  }

  if (scanResults.databases && scanResults.databases.length > 0) {
    parts.push(
      'Databases: ' +
        scanResults.databases
          .map((d) => `${d.name}${d.requiredVersion ? ' (' + d.requiredVersion + ')' : ''}`)
          .join(', ')
    );
  }

  if (scanResults.tools && scanResults.tools.length > 0) {
    parts.push(
      'Tools/Frameworks: ' +
        scanResults.tools
          .map((t) => `${t.name}${t.requiredVersion ? ' (' + t.requiredVersion + ')' : ''}`)
          .join(', ')
    );
  }

  if (scanResults.services && scanResults.services.length > 0) {
    parts.push('Services: ' + scanResults.services.map((s) => s.name).join(', '));
  }

  if (scanResults.requiredEnvVars && scanResults.requiredEnvVars.length > 0) {
    parts.push('Required Env Vars: ' + scanResults.requiredEnvVars.join(', '));
  }

  // Flatten all system results for installed/missing
  if (systemResults) {
    const allItems = [
      ...(systemResults.runtimes || []),
      ...(systemResults.languages || []),
      ...(systemResults.databases || []),
      ...(systemResults.services || []),
      ...(systemResults.tools || []),
    ];

    const installed = allItems
      .filter((r) => r.installed)
      .map((r) => `${r.name} ${r.installedVersion || ''}`.trim());
    const missing = allItems.filter((r) => !r.installed).map((r) => r.name);

    if (installed.length > 0) parts.push('Installed: ' + installed.join(', '));
    if (missing.length > 0) parts.push('Missing: ' + missing.join(', '));
  }

  return parts.join('\n');
}

/**
 * Display AI response with markdown rendering in a styled box
 */
function displayAIResponse(title, content) {
  const colored = renderMarkdown(content);
  console.log('');
  console.log(
    boxen(colored, {
      title: chalk.bold.cyan(title),
      titleAlignment: 'center',
      padding: { top: 1, bottom: 1, left: 1, right: 1 },
      margin: { top: 0, bottom: 1, left: 2, right: 2 },
      borderStyle: 'round',
      borderColor: 'cyan',
    })
  );
}

/**
 * Display an error in a styled box
 */
function displayAIError(message) {
  console.log('');
  console.log(
    boxen(chalk.red(message), {
      title: chalk.bold.red('❌ AI Error'),
      titleAlignment: 'center',
      padding: 1,
      margin: { top: 0, bottom: 1, left: 2, right: 2 },
      borderStyle: 'round',
      borderColor: 'red',
    })
  );
}

/**
 * 🤖 Basic Overview – What is this project?
 */
async function explainBasicOverview(scanResults, systemResults) {
  const spinner = ora({ text: chalk.yellow('🧠 Asking AI...'), spinner: 'dots12' }).start();

  try {
    const context = buildContext(scanResults, systemResults);
    const prompt =
      'In 2-3 short sentences, what is this project and what does it do?\n\n' + context;

    const answer = await callGroq(prompt, 256);
    spinner.succeed(chalk.green('AI response ready'));
    displayAIResponse('🤖 Project Overview', answer);
  } catch (err) {
    spinner.fail(chalk.red('AI request failed'));
    displayAIError(err.message);
  }
}

/**
 * 📊 Tech Stack Explanation
 */
async function explainTechStack(scanResults, systemResults) {
  const spinner = ora({ text: chalk.yellow('🧠 Asking AI...'), spinner: 'dots12' }).start();

  try {
    const context = buildContext(scanResults, systemResults);
    const prompt =
      'List the tech stack of this project in grouped bullet points.\n' +
      'Groups: **Runtime**, **Languages**, **Databases**, **Frameworks/Tools**.\n' +
      'Include versions where known. Max 12 lines.\n\n' +
      context;

    const answer = await callGroq(prompt, 400);
    spinner.succeed(chalk.green('AI response ready'));
    displayAIResponse('📊 Tech Stack', answer);
  } catch (err) {
    spinner.fail(chalk.red('AI request failed'));
    displayAIError(err.message);
  }
}

/**
 * 💻 System Info & What to Install
 */
async function explainSystemAndInstallation(scanResults, systemResults) {
  const spinner = ora({ text: chalk.yellow('🧠 Asking AI...'), spinner: 'dots12' }).start();

  try {
    const context = buildContext(scanResults, systemResults);
    const platform =
      process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';

    const prompt =
      `User's OS: ${platform}\n\n` +
      context +
      '\n\n' +
      'Show 2 sections:\n' +
      '### ✅ Ready (list what\'s installed, one line each)\n' +
      '### ❌ Missing (list what\'s missing with ONE install command each, using `brew`/`apt`/`winget` for the user\'s OS)\n' +
      'Keep it under 15 lines total. No explanations, just name + command.';

    const answer = await callGroq(prompt, 512);
    spinner.succeed(chalk.green('AI response ready'));
    displayAIResponse('💻 System Readiness', answer);
  } catch (err) {
    spinner.fail(chalk.red('AI request failed'));
    displayAIError(err.message);
  }
}

/**
 * 🚀 How to Run This Project
 */
async function explainHowToRun(scanResults, systemResults) {
  const spinner = ora({ text: chalk.yellow('🧠 Asking AI...'), spinner: 'dots12' }).start();

  try {
    const context = buildContext(scanResults, systemResults);
    const prompt =
      'Give numbered steps to run this project. Include:\n' +
      '1. Install deps command\n' +
      '2. Setup steps (db, env, migrations) if applicable\n' +
      '3. Start command\n' +
      'Wrap ALL commands in backticks. Max 10 lines.\n\n' +
      context;

    const answer = await callGroq(prompt, 400);
    spinner.succeed(chalk.green('AI response ready'));
    displayAIResponse('🚀 How to Run', answer);
  } catch (err) {
    spinner.fail(chalk.red('AI request failed'));
    displayAIError(err.message);
  }
}

module.exports = {
  explainBasicOverview,
  explainTechStack,
  explainSystemAndInstallation,
  explainHowToRun,
};
