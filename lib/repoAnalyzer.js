const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const toml = require('toml');
const simpleGit = require('simple-git');
const { glob } = require('glob');

/**
 * Clone a remote repo into a temp directory
 * @param {string} url - Git URL
 * @returns {Promise<string>} path to cloned repo
 */
async function cloneRepo(url) {
  const tempDir = path.join(os.tmpdir(), `repoready-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const git = simpleGit();
  await git.clone(url, tempDir, ['--depth', '1']);
  return tempDir;
}

/**
 * Scan a repo directory for dependency files and build a unified dependency map
 * @param {string} repoPath
 * @returns {Promise<object>} dependency map
 */
async function scanDependencyFiles(repoPath) {
  const depMap = {
    runtimes: [],
    languages: [],
    databases: [],
    services: [],
    tools: [],
    requiredEnvVars: [],
  };

  // --- package.json ---
  const pkgPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      // Engines
      let nodeAdded = false;
      if (pkg.engines) {
        if (pkg.engines.node) {
          depMap.runtimes.push({
            name: 'Node.js',
            requiredVersion: pkg.engines.node,
            source: 'package.json',
          });
          nodeAdded = true;
        }
        if (pkg.engines.npm) {
          depMap.runtimes.push({
            name: 'npm',
            requiredVersion: pkg.engines.npm,
            source: 'package.json',
          });
        }
      }

      if (!nodeAdded) {
        depMap.runtimes.push({
          name: 'Node.js',
          requiredVersion: null,
          source: 'package.json',
        });
      }

      // Extract tools from scripts
      const scripts = pkg.scripts || {};
      const knownTools = [
        'webpack',
        'eslint',
        'jest',
        'prettier',
        'tsc',
        'typescript',
        'vite',
        'rollup',
        'babel',
        'mocha',
        'nodemon',
        'ts-node',
        'next',
        'react-scripts',
      ];
      const scriptValues = Object.values(scripts).join(' ');
      for (const tool of knownTools) {
        if (scriptValues.includes(tool)) {
          depMap.tools.push({
            name: tool,
            requiredVersion: null,
            source: 'package.json scripts',
          });
        }
      }

      // Dependencies (just record key packages for awareness)
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
        ...(pkg.peerDependencies || {}),
      };

      // Detect databases/services from dependencies
      const dbPackages = {
        pg: 'PostgreSQL',
        'pg-promise': 'PostgreSQL',
        mysql: 'MySQL',
        mysql2: 'MySQL',
        mongodb: 'MongoDB',
        mongoose: 'MongoDB',
        redis: 'Redis',
        ioredis: 'Redis',
        sqlite3: 'SQLite',
        'better-sqlite3': 'SQLite',
      };
      for (const [pkgName, db] of Object.entries(dbPackages)) {
        if (allDeps[pkgName] && !depMap.databases.find((d) => d.name === db)) {
          depMap.databases.push({
            name: db,
            requiredVersion: null,
            source: 'package.json dependencies',
          });
        }
      }

      // Detect frameworks & libraries from dependencies
      const frameworkPackages = {
        'react': 'React',
        'react-dom': 'React DOM',
        'next': 'Next.js',
        'vue': 'Vue.js',
        'nuxt': 'Nuxt.js',
        '@angular/core': 'Angular',
        'svelte': 'Svelte',
        'express': 'Express.js',
        'fastify': 'Fastify',
        'koa': 'Koa',
        'hapi': 'Hapi',
        '@nestjs/core': 'NestJS',
        'tailwindcss': 'Tailwind CSS',
        'bootstrap': 'Bootstrap',
        'jquery': 'jQuery',
        'axios': 'Axios',
        'socket.io': 'Socket.IO',
        'graphql': 'GraphQL',
        'prisma': 'Prisma',
        'sequelize': 'Sequelize',
        'typeorm': 'TypeORM',
        'electron': 'Electron',
        'react-native': 'React Native',
      };
      for (const [pkgName, fw] of Object.entries(frameworkPackages)) {
        if (allDeps[pkgName]) {
          depMap.tools.push({
            name: fw,
            requiredVersion: allDeps[pkgName],
            source: 'package.json',
          });
        }
      }

      // Detect TypeScript
      if (allDeps['typescript']) {
        depMap.languages.push({
          name: 'TypeScript',
          requiredVersion: allDeps['typescript'],
          source: 'package.json',
        });
      }
    } catch (e) {
      // Malformed package.json, skip
    }
  }

  // --- requirements.txt ---
  const reqPath = path.join(repoPath, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    const content = fs.readFileSync(reqPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    if (lines.length > 0) {
      // Python is needed
      if (!depMap.languages.find((l) => l.name === 'Python')) {
        depMap.languages.push({
          name: 'Python',
          requiredVersion: null,
          source: 'requirements.txt',
        });
      }
    }
  }

  // --- Pipfile ---
  const pipfilePath = path.join(repoPath, 'Pipfile');
  if (fs.existsSync(pipfilePath)) {
    try {
      const content = fs.readFileSync(pipfilePath, 'utf8');
      const parsed = toml.parse(content);
      if (parsed.requires && parsed.requires.python_version) {
        const existing = depMap.languages.find((l) => l.name === 'Python');
        if (existing) {
          existing.requiredVersion = parsed.requires.python_version;
          existing.source = 'Pipfile';
        } else {
          depMap.languages.push({
            name: 'Python',
            requiredVersion: parsed.requires.python_version,
            source: 'Pipfile',
          });
        }
      }
    } catch (e) {
      // skip
    }
  }

  // --- pyproject.toml ---
  const pyprojectPath = path.join(repoPath, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf8');
      const parsed = toml.parse(content);

      // Poetry
      let pyVersion = null;
      if (parsed.tool && parsed.tool.poetry && parsed.tool.poetry.dependencies) {
        pyVersion = parsed.tool.poetry.dependencies.python;
      }
      // PEP 621
      if (parsed.project && parsed.project['requires-python']) {
        pyVersion = parsed.project['requires-python'];
      }
      if (pyVersion) {
        const existing = depMap.languages.find((l) => l.name === 'Python');
        if (existing) {
          existing.requiredVersion = pyVersion;
          existing.source = 'pyproject.toml';
        } else {
          depMap.languages.push({
            name: 'Python',
            requiredVersion: pyVersion,
            source: 'pyproject.toml',
          });
        }
      }
    } catch (e) {
      // skip
    }
  }

  // --- Gemfile ---
  const gemfilePath = path.join(repoPath, 'Gemfile');
  if (fs.existsSync(gemfilePath)) {
    try {
      const content = fs.readFileSync(gemfilePath, 'utf8');
      const rubyMatch = content.match(/ruby\s+['"]([^'"]+)['"]/);
      depMap.languages.push({
        name: 'Ruby',
        requiredVersion: rubyMatch ? rubyMatch[1] : null,
        source: 'Gemfile',
      });
    } catch (e) {
      // skip
    }
  }

  // --- composer.json ---
  const composerPath = path.join(repoPath, 'composer.json');
  if (fs.existsSync(composerPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(composerPath, 'utf8'));
      if (parsed.require && parsed.require.php) {
        depMap.languages.push({
          name: 'PHP',
          requiredVersion: parsed.require.php,
          source: 'composer.json',
        });
      } else {
        depMap.languages.push({
          name: 'PHP',
          requiredVersion: null,
          source: 'composer.json',
        });
      }
    } catch (e) {
      // skip
    }
  }

  // --- Dockerfile ---
  const dockerfilePath = path.join(repoPath, 'Dockerfile');
  if (fs.existsSync(dockerfilePath)) {
    try {
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      const fromMatches = content.matchAll(/^FROM\s+([^\s]+)/gm);
      for (const match of fromMatches) {
        const image = match[1];
        const [imageName, tag] = image.split(':');
        const baseName = imageName.split('/').pop();

        // Detect runtime/language from base image
        const imageMap = {
          node: 'Node.js',
          python: 'Python',
          ruby: 'Ruby',
          php: 'PHP',
          golang: 'Go',
          java: 'Java',
          openjdk: 'Java',
          rust: 'Rust',
        };

        const detected = imageMap[baseName];
        if (detected) {
          const category = ['Node.js', 'npm'].includes(detected) ? 'runtimes' : 'languages';
          const existing = depMap[category].find((l) => l.name === detected);
          if (!existing) {
            depMap[category].push({
              name: detected,
              requiredVersion: tag || null,
              source: 'Dockerfile',
            });
          }
        }

        // Docker itself is required
        if (!depMap.tools.find((t) => t.name === 'docker')) {
          depMap.tools.push({
            name: 'docker',
            requiredVersion: null,
            source: 'Dockerfile',
          });
        }
      }
    } catch (e) {
      // skip
    }
  }

  // --- docker-compose.yml ---
  const composePaths = [
    path.join(repoPath, 'docker-compose.yml'),
    path.join(repoPath, 'docker-compose.yaml'),
    path.join(repoPath, 'compose.yml'),
    path.join(repoPath, 'compose.yaml'),
  ];

  for (const composePath of composePaths) {
    if (fs.existsSync(composePath)) {
      try {
        const content = fs.readFileSync(composePath, 'utf8');
        const parsed = yaml.load(content);
        if (parsed && parsed.services) {
          for (const [serviceName, config] of Object.entries(parsed.services)) {
            const image = config.image || '';
            const [imageName, tag] = image.split(':');
            const baseName = (imageName || serviceName).split('/').pop().toLowerCase();

            const serviceMap = {
              postgres: 'PostgreSQL',
              postgresql: 'PostgreSQL',
              mysql: 'MySQL',
              mariadb: 'MariaDB',
              mongo: 'MongoDB',
              mongodb: 'MongoDB',
              redis: 'Redis',
              elasticsearch: 'Elasticsearch',
              rabbitmq: 'RabbitMQ',
              kafka: 'Kafka',
              memcached: 'Memcached',
              minio: 'MinIO',
              nginx: 'Nginx',
            };

            const dbMap = {
              PostgreSQL: true,
              MySQL: true,
              MariaDB: true,
              MongoDB: true,
              SQLite: true,
            };

            const detected = serviceMap[baseName];
            if (detected) {
              const category = dbMap[detected] ? 'databases' : 'services';
              if (!depMap[category].find((d) => d.name === detected)) {
                depMap[category].push({
                  name: detected,
                  requiredVersion: tag || null,
                  source: path.basename(composePath),
                });
              }
            }
          }

          // docker-compose requires docker
          if (!depMap.tools.find((t) => t.name === 'docker-compose')) {
            depMap.tools.push({
              name: 'docker-compose',
              requiredVersion: null,
              source: path.basename(composePath),
            });
          }
        }
      } catch (e) {
        // skip
      }
      break; // only parse first found compose file
    }
  }

  // --- .nvmrc / .node-version ---
  for (const fname of ['.nvmrc', '.node-version']) {
    const fpath = path.join(repoPath, fname);
    if (fs.existsSync(fpath)) {
      const version = fs.readFileSync(fpath, 'utf8').trim().replace(/^v/, '');
      const existing = depMap.runtimes.find((r) => r.name === 'Node.js');
      if (existing) {
        if (!existing.requiredVersion) {
          existing.requiredVersion = '>=' + version;
          existing.source = fname;
        }
      } else {
        depMap.runtimes.push({
          name: 'Node.js',
          requiredVersion: '>=' + version,
          source: fname,
        });
      }
    }
  }

  // --- .python-version ---
  const pyVersionPath = path.join(repoPath, '.python-version');
  if (fs.existsSync(pyVersionPath)) {
    const version = fs.readFileSync(pyVersionPath, 'utf8').trim();
    const existing = depMap.languages.find((l) => l.name === 'Python');
    if (existing) {
      existing.requiredVersion = version;
      existing.source = '.python-version';
    } else {
      depMap.languages.push({
        name: 'Python',
        requiredVersion: version,
        source: '.python-version',
      });
    }
  }

  // --- .ruby-version ---
  const rubyVersionPath = path.join(repoPath, '.ruby-version');
  if (fs.existsSync(rubyVersionPath)) {
    const version = fs.readFileSync(rubyVersionPath, 'utf8').trim();
    const existing = depMap.languages.find((l) => l.name === 'Ruby');
    if (existing) {
      existing.requiredVersion = version;
      existing.source = '.ruby-version';
    } else {
      depMap.languages.push({
        name: 'Ruby',
        requiredVersion: version,
        source: '.ruby-version',
      });
    }
  }

  // --- .tool-versions (asdf) ---
  const toolVersionsPath = path.join(repoPath, '.tool-versions');
  if (fs.existsSync(toolVersionsPath)) {
    const content = fs.readFileSync(toolVersionsPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim());
    const asdfMap = {
      nodejs: { name: 'Node.js', category: 'runtimes' },
      python: { name: 'Python', category: 'languages' },
      ruby: { name: 'Ruby', category: 'languages' },
      golang: { name: 'Go', category: 'languages' },
      java: { name: 'Java', category: 'languages' },
      rust: { name: 'Rust', category: 'languages' },
      php: { name: 'PHP', category: 'languages' },
    };

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const [tool, version] = parts;
        const mapped = asdfMap[tool];
        if (mapped) {
          const existing = depMap[mapped.category].find((r) => r.name === mapped.name);
          if (!existing) {
            depMap[mapped.category].push({
              name: mapped.name,
              requiredVersion: version,
              source: '.tool-versions',
            });
          }
        }
      }
    }
  }

  // --- .env.example ---
  const envExamplePath = path.join(repoPath, '.env.example');
  if (fs.existsSync(envExamplePath)) {
    const content = fs.readFileSync(envExamplePath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=/i);
        if (match) {
          depMap.requiredEnvVars.push(match[1]);
        }
      }
    }
  }

  return depMap;
}

module.exports = {
  cloneRepo,
  scanDependencyFiles,
};
