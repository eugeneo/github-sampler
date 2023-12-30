import path from "path";

import winston from "winston";

import { Database, DatabaseSchema, FileRecord } from "./database";
import { GithubApi } from "./github_api";
import { getLogger } from "./logger";
import { File, Language, Repository } from "./types";

export type DownloaderOptions = {
  maxSize: number;
  minSize: number;
  languages: Set<Language>;
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

type SaveResult = [string, string];

function mergeDatabases(db1: Database, db2: Database): Database {
  const files = { ...db1.files, ...db2.files };
  const known = { ...db1.known, ...db2.known };
  const visited = [...new Set([...db1.visited, ...db2.visited])];
  return { files, known, visited };
}

export class Downloader {
  constructor(
    private githubApi: GithubApi,
    private readonly save: (
      file: File,
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
    includes: string[] | null
  ): Promise<Database> {
    const result = await this.processDir(repository, null);
    return DatabaseSchema.parse(mergeDatabases(this.database, result));
  }

  private async processDir(
    repository: Repository,
    path: string | null
  ): Promise<Database> {
    const result = await this.githubApi.listFiles(repository, path);
    const downloaded = await Promise.all(
      result.map(async (file): Promise<Database> => {
        try {
          if (file.type === "dir") {
            return await this.processDir(repository, file.path);
          } else if (this.isRelevant(file)) {
            return {
              files: await this.processFile(file),
              visited: [],
              known: {},
            };
          }
        } catch (e) {
          this.logger_.error(`Error processing ${file.path}`, e);
        }
        return { files: {}, visited: [], known: {} };
      })
    );
    return downloaded.reduce(mergeDatabases);
  }

  private async processFile(file: File): Promise<Database["files"]> {
    let dest_or_error: { destination: string } | { error: string } | null =
      null;
    try {
      const contents = await this.githubApi.downloadFile(file);
      const result = await this.save(file, contents);
      this.logger_.debug(`Downloaded ${file.path}`);
      dest_or_error = { destination: result[0] };
    } catch (e) {
      this.logger_.error(`Error downloading ${file.path}`, e);
      dest_or_error = { error: (e as any).message ?? String(e) };
    }
    return {
      [file.sha]: {
        ...file,
        ...dest_or_error,
        language: getFileLanguage(file.path),
        type: "file",
      },
    };
  }

  private isRelevant({ path, size }: File) {
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

  private readonly logger_: winston.Logger;
}
