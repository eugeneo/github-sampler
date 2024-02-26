import { loadDatabase } from './database';
import { Downloader, ProjectSchema } from './downloader';
import { GithubApiImpl } from './github';
import dotenv from 'dotenv';
import { writeFileSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import yargs from 'yargs';

dotenv.config();

async function loadProject(projectPath: string) {
  const contents = await fs.readFile(projectPath, 'utf-8');
  return ProjectSchema.parse(JSON.parse(contents));
}

class Throttler {
  constructor(private concurrency: number) {}

  async perform<T>(fn: () => Promise<T>): Promise<T> {
    await this.token();
    try {
      return await fn();
    } finally {
      this.releaseToken();
    }
  }

  private async token() {
    if (--this.concurrency >= 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private releaseToken() {
    if (this.queue.length > 0) {
      this.queue.shift()!();
    } else {
      this.concurrency++;
    }
  }

  private queue = [] as (() => void)[];
}

async function downloadCommand(
  params: Awaited<typeof argv> & { directory: string; project: string },
) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }
  const databasePath = path.join(params.directory as string, params.indexName);
  const db = loadDatabase(databasePath);
  const githubApi = new GithubApiImpl(token);
  const downloader = new Downloader(githubApi, await db);
  const throttler = new Throttler(params.qps);
  const project = await loadProject(params.project);
  const dirs = new Set(project.map(({ files }) => Object.keys(files)).flat());
  const langDirs = (
    await Promise.all(
      [...dirs].map(async (language) => {
        const p = path.join(params.directory, language);
        try {
          await fs.mkdir(p);
        } catch (e) {
          // ignore
        }
        return { [language]: p };
      }),
    )
  ).reduce((v1, v2) => ({ ...v1, ...v2 }), {});
  const res = (
    await Promise.all(
      project.map(async (repo) => {
        const files = await downloader.prepareFileList(repo);
        return await Promise.all(
          files.map((file) =>
            throttler.perform(async () => {
              const dir = langDirs[file.language];
              if (!dir) {
                throw new Error(`No directory for language: ${file.language}`);
              }
              const dest = path.join(dir, file.sha + path.extname(file.path));
              const contents = await githubApi.downloadFile(file.url);
              await fs.writeFile(dest, contents);
              return { ...file, outputPath: dest };
            }),
          ),
        );
      }),
    )
  ).flat();
  writeFileSync(databasePath, JSON.stringify(res, null, 2));
}

// setup default yargs command
const argv = yargs(process.argv.slice(2))
  .command(
    '* <project> <directory>',
    'Download files from GitHub',
    (yargs) => {
      yargs
        .positional('project', {
          description: 'Project file',
          normalize: true,
        })
        .positional('directory', {
          description: 'Directory to download files to',
          type: 'string',
          normalize: true,
        });
    },
    async (commandArgv) => {
      await downloadCommand(commandArgv as any);
    },
  )
  // Implement later - do not overthink!
  // .command(
  //   'check <directory>',
  //   "Check the directory for consistency with the index file. Doesn't download anything",
  //   (yargs) => {
  //     yargs
  //       .positional('directory', {
  //         description: 'Directory to check',
  //         type: 'string',
  //         normalize: true,
  //       })
  //       .option('cleanup', {
  //         description: 'Remove dangling files',
  //         type: 'boolean',
  //         default: false,
  //       });
  //   },
  //   async (commandArgv) => {
  //     await checkCommand(commandArgv);
  //   },
  // )
  .options({
    qps: {
      description: 'number of GitHub API requests per second',
      type: 'number',
      default: 20,
    },
    'dry-run': {
      description: 'Do not write to local file system',
      type: 'boolean',
      default: false,
    },
    'index-name': {
      description: 'Name of the index file',
      type: 'string',
      default: 'index.json',
    },
    'check-db': {
      description: 'Check the database for consistency and exit',
      type: 'boolean',
      default: false,
    },
    'clear-dangling': {
      description: 'Clear dangling entries from the database',
      type: 'boolean',
      default: false,
    },
  })
  .help()
  .requiresArg('repository').argv;
