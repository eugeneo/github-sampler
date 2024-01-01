import { Database, Entry } from "./database";
import { GithubApi } from "./github";
import { getLogger } from "./logger";
import { Counters, Stats } from "./stats";
import { Language, Repository } from "./validator";
import path from "path";

export type DownloaderOptions = {
  dirs?: string[];
  maxSize: number;
  minSize: number;
  languages: Set<Language>;
  logSkipped?: boolean;
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
    this.stats_ = new Stats(options.languages);
  }

  async processRepository(
    repository: Repository,
    rev: string
  ): Promise<Database> {
    this.stats_.increment(
      Counters.DatabaseFiles,
      Object.keys(this.database).length
    );
    const tree = await this.githubApi.fetchTree(repository, rev);
    this.stats_.increment(Counters.TreeFiles, tree.tree.length);
    const entriesToDownload = Object.values(
      Object.fromEntries(
        tree.tree
          .filter((entry) => this.shouldDownload(entry))
          .map((entry) => [entry.sha, entry] as const)
      )
    );
    this.stats_.increment(Counters.Matching, entriesToDownload.length);
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
    let destOrError: { destination: string } | { error: string } | null = null;
    try {
      if (!file.url) {
        throw new Error(`No url for ${file.path}`);
      }
      const contents = await this.githubApi.downloadFile(file.url);
      const result = await this.save(file, contents);
      this.logger_.debug(`Downloaded ${file.path}`);
      destOrError = { destination: result };
      this.stats_.increment(Counters.Files);
    } catch (e) {
      this.logger_.error(`Error downloading ${file.path}`, e);
      destOrError = { error: (e as any).message ?? String(e) };
      this.stats_.increment(Counters.Errors);
    }
    return [
      file.sha,
      {
        ...file,
        ...destOrError,
        language: getFileLanguage(file.path).toString(),
      },
    ];
  }

  private shouldDownload({ path, size, sha, type }: Entry) {
    const log = this.options.logSkipped ? this.logger_.debug : () => {};
    if (type !== "blob") {
      this.stats_.increment(Counters.NotFiles);
      log(`Skipping ${path}, not a file`);
      return false;
    }
    if (
      size === undefined ||
      size < this.options.minSize ||
      size > this.options.maxSize
    ) {
      this.stats_.increment(Counters.WrongSize);
      log(`Skipping ${path}, wrong size`);
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
      this.stats_.increment(Counters.Excluded);
      log(`Skipping ${path}, not in included paths`);
      return false;
    }
    if (this.database[sha]) {
      this.stats_.increment(Counters.AlreadyDownloaded);
      log(`Skipping ${path}, already downloaded`);
      return false;
    }
    const language = getFileLanguage(path);
    this.stats_.histogram(Counters.Language, language);
    if (
      language === Language.UNKNOWN ||
      (!this.options.languages.has(Language.ALL) &&
        !this.options.languages.has(language))
    ) {
      log(`Skipping ${path}, language is: ${language}`);
      return false;
    }
    return true;
  }

  stats() {
    return this.stats_;
  }

  private readonly stats_: Stats;
  private readonly logger_ = getLogger("downloader");
}
