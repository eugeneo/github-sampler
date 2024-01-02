import { Entry, loadDatabase, saveDatabase } from "./database";
import { Downloader } from "./downloader";
import { GithubApiImpl } from "./github";
import { Language, Repository } from "./validator";
import chalk from "chalk";
import dotenv from "dotenv";
import fs, { writeFile } from "fs/promises";
import path from "path";
import yargs from "yargs";

dotenv.config();

type RepoId = {
  owner: string;
  name: string;
};

function buildSaver(directory: string) {
  return async (
    category: string,
    { sha }: Entry,
    contents: string
  ): Promise<string> => {
    const dest = path.join(directory, category);
    await fs.mkdir(dest, { recursive: true });
    const filePath = path.join(dest, sha);
    await writeFile(filePath, contents, "utf-8");
    return path.relative(directory, filePath);
  };
}

function dryRunStore(
  category: string,
  file: Entry,
  contents: string
): Promise<string> {
  // eslint-disable-next-line no-console
  console.info(
    `Saving ${chalk.whiteBright(file.path)}, language: ${chalk.whiteBright(
      category
    )} first 25 characters:\n${chalk.gray(contents.slice(0, 25))}`
  );
  return Promise.resolve(file.path);
}

async function downloadCommand(
  params: Awaited<typeof argv> & { directory: string }
) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }
  const store = params.dryRun ? dryRunStore : buildSaver(params.directory);
  const databasePath = path.join(params.directory as string, params.indexName);
  const downloader = new Downloader(
    new GithubApiImpl(token),
    store,
    await loadDatabase(databasePath),
    {
      dirs: params.include,
      languages: new Set(params.language as Language[]),
      logSkipped: params.logSkipped,
      minSize: params.minSize,
      maxSize: params.maxSize,
      maxFiles: params.maxFiles,
    }
  );
  const result = await downloader.processRepository(
    params.repository as Repository,
    params.sha
  );
  if (!params.dryRun) {
    await saveDatabase(databasePath, result);
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
    async (commandArgv) => {
      await downloadCommand(commandArgv as any);
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
    include: {
      alias: "i",
      description: "Directories to include",
      type: "string",
      array: true,
    },
    "index-name": {
      description: "Name of the index file",
      type: "string",
      default: "index.json",
    },
    "log-skipped": {
      description: "Log skipped files",
      type: "boolean",
      default: false,
    },
    "max-files": {
      alias: "c",
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
  })
  .help()
  .requiresArg("repository").argv;
