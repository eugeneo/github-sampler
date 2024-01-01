import { Entry, loadDatabase, saveDatabase } from "./database";
import { Downloader } from "./downloader";
import { GithubApiImpl } from "./github";
import { Language, Repository } from "./validator";
import chalk from "chalk";
import dotenv from "dotenv";
import yargs from "yargs";

dotenv.config();

type RepoId = {
  owner: string;
  name: string;
};

function save(file: Entry, contents: string): Promise<string> {
  // todo: actually save file
  return Promise.resolve(file.path);
}

function dryRunStore(file: Entry, contents: string): Promise<string> {
  // eslint-disable-next-line no-console
  console.info(
    `Saving ${chalk.whiteBright(file.path)}, first 25 characters:\n${chalk.gray(
      contents.slice(0, 25)
    )}`
  );
  return Promise.resolve(file.path);
}

async function downloadCommand(params: typeof argv) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }
  new GithubApiImpl(token);
  const {
    dryRun,
    include,
    language,
    logSkipped,
    maxSize,
    maxFiles,
    minSize,
    repository,
    sha,
  } = await params;
  const store = dryRun ? dryRunStore : save;
  const downloader = new Downloader(
    new GithubApiImpl(token),
    store,
    await loadDatabase(""),
    {
      dirs: include,
      languages: new Set(language as Language[]),
      logSkipped,
      minSize: minSize,
      maxSize: maxSize,
      maxFiles: maxFiles,
    }
  );
  const result = await downloader.processRepository(
    repository as Repository,
    sha
  );
  if (!dryRun) {
    saveDatabase("", result);
  }
  downloader.stats().print();
}

// setup default yargs command
const argv = yargs(process.argv.slice(2))
  .command(
    "* <repository> <directory>",
    "Download files from GitHub",
    (yargs) => {
      yargs
        .positional("repository", {
          description: "GitHub repository to download files from",
          coerce: (repo): RepoId => {
            const matches = repo.split(/\//);
            if (repo.indexOf("/") === -1) {
              throw new Error("Repository must be in the format owner/repo");
            }
            return {
              owner: matches[0],
              name: matches[1],
            };
          },
        })
        .positional("sha", {
          description: "Directory to download files to",
          type: "string",
          default: "master",
          normalize: true,
        });
    },
    (argv) => {
      // yargs do be trolling
      downloadCommand(argv as any);
    }
  )
  .options({
    qps: {
      description: "number of GitHub API requests per second",
      type: "number",
      default: 20,
    },
    "dry-run": {
      description: "Do not write to local file system",
      type: "boolean",
      default: false,
    },
    "log-skipped": {
      description: "Log skipped files",
      type: "boolean",
      default: false,
    },
    "max-files": {
      description: "Maximum number of files to download",
      type: "number",
      default: 10,
    },
    "min-size": {
      description: "Minimum file size to download",
      type: "number",
      default: 500,
    },
    "max-size": {
      description: "Maximum file size to download",
      type: "number",
      default: 5000,
    },
    language: {
      alias: "l",
      description: "File types to download",
      choices: Object.values(Language).filter((v) => v !== Language.UNKNOWN),
      default: "all",
      array: true,
    },
    sha: {
      description: "Commit SHA to download from",
      type: "string",
      default: "master",
      normalize: true,
    },
    include: {
      alias: "i",
      description: "Directories to include",
      type: "string",
      array: true,
    },
  })
  .help()
  .requiresArg("repository").argv;
