import dotenv from "dotenv";
import yargs from "yargs";

import { Downloader, DownloaderOptions, Language } from "./downloader.js";

dotenv.config();

type RepoId = {
  owner: string;
  name: string;
};

async function fetchFiles(
  repo: RepoId,
  dir: string,
  options: Omit<DownloaderOptions, "githubToken">
) {
  const downloader = new Downloader(repo, {
    githubToken: process.env.GITHUB_TOKEN!,
    ...options,
  });
  if (!options.include?.length) {
    await downloader.processDir(null);
  } else {
    await Promise.all(
      options.include!.map((dir) => downloader.processDir(dir))
    );
  }
}

// setup default yargs command
const argv = await yargs(process.argv.slice(2))
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
        .positional("directory", {
          description: "Directory to download files to",
          type: "string",
          normalize: true,
        })
        .option("include", {
          description: "Directory to include",
          type: "string",
          array: true,
          alias: "I",
        });
    },
    async (argv) => {
      console.log(argv);
      const language = argv.language as Language[];
      const { directory, repository, ...rest } = argv as unknown as Omit<
        DownloaderOptions,
        "githubToken"
      > & {
        directory: string;
        repository: RepoId;
      };
      fetchFiles(repository, directory, {
        ...rest,
        languages: new Set(language),
      });
    }
  )
  .options({
    "concurrent-requests": {
      alias: "j",
      description: "number of concurrent downloads",
      type: "number",
      default: 5,
    },
    "dry-run": {
      description: "Do not perform any modifications to local file system",
      type: "boolean",
      default: false,
    },
    "max-dirs": {
      description: "Maximum number of folders to visit",
      type: "number",
      default: 20,
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

type Options = typeof argv;
