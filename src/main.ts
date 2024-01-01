import dotenv from "dotenv";
import yargs from "yargs";

import { GithubApiImpl } from "./github";
import { Downloader, DownloaderOptions } from "./downloader";
import { Language } from "./validator";

dotenv.config();

type RepoId = {
  owner: string;
  name: string;
};

async function downloadCommand(params: DownloaderOptions) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }
  new GithubApiImpl(token);
  console.info(params);
  // new Downloader();
  throw new Error("Not implemented");
}

// setup default yargs command
const argv = yargs(process.argv.slice(2))
  .command(
    "$0 [options] <repository> <directory>",
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
      downloadCommand(argv as unknown as DownloaderOptions);
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
  })
  .help()
  .requiresArg("repository").argv;

console.log(argv);