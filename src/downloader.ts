import path from "path";

import { Logger } from "winston";

import { Database, Entry } from "./database";
import { GithubApi } from "./github";
import { getLogger } from "./logger";
import { Language, Repository } from "./types";

export type DownloaderOptions = {
  maxSize: number;
  minSize: number;
  languages: Set<Language>;
  dirs?: string[];
  maxFiles?: number;
};

function getFileLanguage(filePath: string): Language {
  switch (path.extname(filePath)) {
    case ".cpp":
    case ".cc":
    case ".h":
    case ".hpp":
    case ".cxx":
    case ".hxx":
    case ".c++":
    case ".h++":
    case ".hh":
    case ".hcc":
    case ".inl":
    case ".ipp":
    case ".tcc":
    case ".tpp":
    case ".txx":
      return Language.CPP;
    case ".java":
      return Language.JAVA;
  }
  return Language.UNKNOWN;
}

type SaveResult = string;

export class Downloader {
  constructor(
    private githubApi: GithubApi,
    private readonly save: (
      file: Entry,
      contents: string
    ) => Promise<SaveResult>,
    private readonly database: Database,
    private readonly options: DownloaderOptions
  ) {
    console.debug(options);
    this.logger_ = getLogger("downloader");
  }

  async processRepository(
    repository: Repository,
    rev: string
  ): Promise<Database> {
    const tree = await this.githubApi.fetchTree(repository, rev);
    const entriesToDownload = Object.values(
      Object.fromEntries(
        tree.tree
          .filter((entry) => this.shouldDownload(entry))
          .map((entry) => [entry.sha, entry] as const)
      )
    );
    const downloaded = [];
    const downloadPromises = Object.entries(this.database).map((entry) =>
      Promise.resolve(entry)
    );
    while (entriesToDownload.length > 0 && downloaded.length < 1000) {
      let i = Math.min(
        entriesToDownload.length,
        this.options.maxFiles
          ? this.options.maxFiles - downloaded.length
          : Number.POSITIVE_INFINITY
      );
      for (; i > 0; i--) {
        const ind = Math.floor(Math.random() * entriesToDownload.length);
        const [entry] = entriesToDownload.splice(ind, 1);
        downloadPromises.push(this.processFile(entry));
      }
      downloaded.push(...(await Promise.all(downloadPromises)));
    }
    return Object.fromEntries(downloaded);
  }

  private async processFile(file: Entry): Promise<[string, Database[string]]> {
    let dest_or_error: { destination: string } | { error: string } | null =
      null;
    try {
      const contents = await this.githubApi.downloadFile(file.url);
      const result = await this.save(file, contents);
      this.logger_.debug(`Downloaded ${file.path}`);
      dest_or_error = { destination: result };
    } catch (e) {
      this.logger_.error(`Error downloading ${file.path}`, e);
      dest_or_error = { error: (e as any).message ?? String(e) };
    }
    return [
      file.sha,
      {
        ...file,
        ...dest_or_error,
        language: getFileLanguage(file.path).toString(),
      },
    ];
  }

  private shouldDownload({ path, size, sha, type }: Entry) {
    if (type !== "blob") {
      this.logger_.debug(`Skipping ${path}, not a file`);
      return false;
    }
    if (
      this.options.dirs &&
      !this.options.dirs.some(
        (dir) =>
          (path.startsWith(dir) && path.length === dir.length) ||
          path[dir.length] === "/"
      )
    ) {
      this.logger_.debug(`Skipping ${path}, not in included paths`);
      return false;
    }
    if (this.database[sha]) {
      this.logger_.debug(`Skipping ${path}, already downloaded`);
      return false;
    }
    if (size < this.options.minSize || size > this.options.maxSize) {
      this.logger_.debug(`Skipping ${path} due to size: ${size}`);
      return false;
    }
    const language = getFileLanguage(path);
    if (
      language === Language.UNKNOWN ||
      (!this.options.languages.has(Language.ALL) &&
        !this.options.languages.has(language))
    ) {
      this.logger_.debug(`Skipping ${path}, language is: ${language}`);
      return false;
    }
    return true;
  }

  private readonly logger_: Logger;
}
