/**
 * Get installation instructions for a missing tool/service based on current platform
 * @param {string} name - name of the dependency
 * @param {string} platform - OS platform (process.platform)
 * @returns {string} instructions
 */
function getInstallInstructions(name, platform) {
  const commonInstructions = {
    'Node.js': {
      darwin: 'Run: brew install node\n     Or install Node Version Manager (nvm) and run: nvm install node',
      linux: 'Run: sudo apt update && sudo apt install nodejs npm\n     Or install Node Version Manager (nvm) and run: nvm install node',
      win32: 'Run in winget: winget install OpenJS.NodeJS\n     Or download installer from: https://nodejs.org/',
      default: 'Install Node Version Manager (nvm) or download installer from: https://nodejs.org/'
    },
    npm: {
      default: 'npm is typically installed automatically with Node.js. Please install or update Node.js.'
    },
    Python: {
      darwin: 'Run: brew install python',
      linux: 'Run: sudo apt update && sudo apt install python3 python3-pip',
      win32: 'Run in winget: winget install Python.Python\n     Or download installer from: https://www.python.org/',
      default: 'Install Python via your system package manager or download from: https://www.python.org/'
    },
    Ruby: {
      darwin: 'Run: brew install ruby\n     Or use rbenv: brew install rbenv && rbenv install <version>',
      linux: 'Run: sudo apt update && sudo apt install ruby-full',
      win32: 'Download and run installer from: https://rubyinstaller.org/',
      default: 'Install Ruby via your package manager or download from: https://www.ruby-lang.org/'
    },
    PHP: {
      darwin: 'Run: brew install php',
      linux: 'Run: sudo apt update && sudo apt install php',
      win32: 'Download PHP binaries from: https://windows.php.net/ and add to PATH',
      default: 'Install PHP via your system package manager.'
    },
    Go: {
      darwin: 'Run: brew install go',
      linux: 'Run: sudo apt update && sudo apt install golang-go',
      win32: 'Run in winget: winget install GoLang.Go\n     Or download installer from: https://go.dev/dl/',
      default: 'Download Go from: https://go.dev/dl/'
    },
    Java: {
      darwin: 'Run: brew install openjdk',
      linux: 'Run: sudo apt update && sudo apt install default-jdk',
      win32: 'Run in winget: winget install Oracle.JDK.21\n     Or download from: https://adoptium.net/',
      default: 'Install Java Development Kit (JDK) from: https://adoptium.net/'
    },
    Rust: {
      default: 'Run: curl --proto \'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh'
    },
    docker: {
      darwin: 'Run: brew install --cask docker\n     Or download Docker Desktop: https://www.docker.com/products/docker-desktop/',
      linux: 'Run: sudo apt update && sudo apt install docker.io',
      win32: 'Run in winget: winget install Docker.DockerDesktop\n     Or download from: https://www.docker.com/products/docker-desktop/',
      default: 'Download Docker Desktop from: https://www.docker.com/products/docker-desktop/'
    },
    'docker-compose': {
      darwin: 'Included with Docker Desktop. Install Docker Desktop.',
      win32: 'Included with Docker Desktop. Install Docker Desktop.',
      linux: 'Run: sudo apt update && sudo apt install docker-compose',
      default: 'Install docker-compose from: https://github.com/docker/compose/releases'
    },
    git: {
      darwin: 'Run: brew install git\n     Or install Xcode Command Line Tools: xcode-select --install',
      linux: 'Run: sudo apt update && sudo apt install git',
      win32: 'Run in winget: winget install Git.Git\n     Or download installer: https://git-scm.com/',
      default: 'Download Git from: https://git-scm.com/'
    },
    PostgreSQL: {
      darwin: 'Run: brew install postgresql\n     Then start service: brew services start postgresql',
      linux: 'Run: sudo apt update && sudo apt install postgresql postgresql-contrib',
      win32: 'Download and run installer from: https://www.postgresql.org/download/windows/',
      default: 'Download installer from: https://www.postgresql.org/'
    },
    Redis: {
      darwin: 'Run: brew install redis\n     Then start service: brew services start redis',
      linux: 'Run: sudo apt update && sudo apt install redis-server',
      win32: 'Install Redis via WSL2 (Windows Subsystem for Linux)\n     Or download Memurai (Redis for Windows Developer Edition): https://www.memurai.com/',
      default: 'Download Redis from: https://redis.io/download/'
    },
    MongoDB: {
      darwin: 'Run: brew tap mongodb/brew && brew install mongodb-community\n     Then start service: brew services start mongodb-community',
      linux: 'Follow the official MongoDB installation instructions for your distribution: https://www.mongodb.com/docs/manual/administration/install-on-linux/',
      win32: 'Run in winget: winget install MongoDB.Server\n     Or download installer from: https://www.mongodb.com/try/download/community',
      default: 'Download MongoDB Community Server: https://www.mongodb.com/try/download/community'
    },
    MySQL: {
      darwin: 'Run: brew install mysql\n     Then start service: brew services start mysql',
      linux: 'Run: sudo apt update && sudo apt install mysql-server',
      win32: 'Run in winget: winget install Oracle.MySQL\n     Or download installer from: https://dev.mysql.com/downloads/installer/',
      default: 'Download MySQL Installer from: https://dev.mysql.com/downloads/'
    },
    MariaDB: {
      darwin: 'Run: brew install mariadb\n     Then start service: brew services start mariadb',
      linux: 'Run: sudo apt update && sudo apt install mariadb-server',
      win32: 'Run in winget: winget install MariaDB.MariaDB\n     Or download installer from: https://mariadb.org/download/',
      default: 'Download MariaDB from: https://mariadb.org/downloads/'
    },
    SQLite: {
      darwin: 'Typically pre-installed on macOS. Otherwise, run: brew install sqlite',
      linux: 'Run: sudo apt update && sudo apt install sqlite3',
      win32: 'Run in winget: winget install SQLite.SQLite\n     Or download precompiled binaries: https://www.sqlite.org/download.html',
      default: 'Download SQLite from: https://www.sqlite.org/'
    },
    Nginx: {
      darwin: 'Run: brew install nginx',
      linux: 'Run: sudo apt update && sudo apt install nginx',
      win32: 'Download Nginx zip file from: https://nginx.org/en/download.html, extract and run',
      default: 'Download Nginx from: https://nginx.org/'
    }
  };

  // Check if it is a local tool/npm package (e.g. webpack, eslint)
  const localTools = [
    'webpack', 'eslint', 'jest', 'prettier', 'tsc', 'typescript', 'vite',
    'rollup', 'babel', 'mocha', 'nodemon', 'ts-node', 'next', 'react-scripts'
  ];

  const lowerName = name.toLowerCase();

  if (localTools.includes(name) || localTools.includes(lowerName)) {
    return `Install locally in your project: npm install --save-dev ${lowerName}\n     Or install globally: npm install -g ${lowerName}`;
  }

  // Lookup by exact name or lowercase
  const instructions = commonInstructions[name] || commonInstructions[lowerName] || Object.entries(commonInstructions).find(([key]) => key.toLowerCase() === lowerName)?.[1];
  if (!instructions) {
    return `Search for and install '${name}' using your system package manager or official website.`;
  }

  return instructions[platform] || instructions.default;
}

module.exports = {
  getInstallInstructions
};
