import path from "path";

import winston from "winston";
import * as z from "zod";

import { getLogger } from "./logger.js";

const File = z.object({
  git_url: z.string(),
  name: z.string(),
  path: z.string(),
  type: z.string(),
  sha: z.string(),
  url: z.string(),
  size: z.number(),
});

const ContentsResponse = z.array(File);

export enum Language {
  ALL = "all",
  UNKNOWN = "unknown",
  CPP = "cpp",
  JAVA = "java",
}

export type DownloaderOptions = {
  githubToken: string;
  concurrentRequests: number;
  include?: string[];
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
}

export class Downloader {
  constructor(
    private readonly repository_: { owner: string; name: string },
    private readonly options_: DownloaderOptions
  ) {
    console.debug(options_);
    this.logger_ = getLogger("downloader");
  }

  async processDir(path: string | null): Promise<void> {
    if (path && this.downloads_ >= this.options_.concurrentRequests) {
      this.logger_.debug(`Pushing ${path} to pending dirs`);
      this.pending_dirs_.unshift(path);
      return;
    }
    this.logger_.info(
      `Processing dir ${this.repository_.owner}/${this.repository_.name}, ${
        path ? `subdir ${path}` : "repository root"
      }`
    );
    this.downloads_++;
    try {
      const contents = ContentsResponse.parse(
        JSON.parse(
          await this.githubRequest(
            `https://api.github.com/repos/${this.repository_.owner}/${
              this.repository_.name
            }/contents/${path?.trim() ? path.trim() : ""}`
          )
        )
      );
      this.logger_.info(
        `${path ? path : "Repository root"} has ${contents.length} files`
      );
      for (const file of contents) {
        if (file.type !== "dir") {
          this.logger_.debug(`Downloading ${file.path}`);
          this.downloadFile(file);
        } else {
          this.processDir(file.path);
        }
      }
      // this.pending_downloads_.push(...contents);
      // while (this.pending_downloads_.length > 0) {
      //   const file = this.pending_downloads_.pop()!;
      //   if (file.type === "dir") {
      //     this.logger_.debug(`Pushing ${file.path} to pending dirs`);
      //     this.pending_dirs_.push(file.path);
      //   } else {
      //     this.logger_.debug(`Downloading ${file.path}`);
      //     // this.downloadFile(file);
      //   }
      // }
      // while (this.pending_downloads_.length > 0) {
      //   const file = this.pending_downloads_.pop()!;
      //   if (file.type === "dir") {
      //     // console.log(file.path, file.git_url, file.url);
      //     // this.pending_downloads_.push(...ContentsResponse.parse(
      //     //   await this.githubRequest(file.path)
      //     // ));
      //   } else {

      //     // console.log(file.git_url, file.sha);
      //     // this.downloadFile(file);
      //   }
      // }
    } catch (e) {
      this.logger_.error(
        `Failed to process ${path ? path : "repository root"}`,
        e
      );
    } finally {
      this.downloads_--;
    }
  }

  private async downloadFile(file: z.infer<typeof File>) {
    if (!this.isRelevant(file)) {
      return;
    }
    const contents = await this.githubRequest(
      file.git_url,
      "application/vnd.github.raw"
    );
    console.log(contents);
    throw new Error("Implement saving the file!");
  }

  private isRelevant({ path, size }: z.infer<typeof File>) {
    if (size < this.options_.minSize || size > this.options_.maxSize) {
      this.logger_.debug(`Skipping ${path} due to size: ${size}`);
      return false;
    }
    const language = getFileLanguage(path);
    if (
      !this.options_.languages.has(Language.ALL) &&
      !this.options_.languages.has(language)
    ) {
      this.logger_.debug(`Skipping ${path} due to language: ${language}`);
      return false;
    }
    return true;
  }

  private async githubRequest(
    url: string,
    contentType = "application/vnd.github+json"
  ) {
    const result = await fetch(url, {
      headers: {
        Accept: contentType,
        Authorization: `Bearer ${this.options_.githubToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!result.ok) {
      throw new Error(`Failed to fetch ${url}: ${result.statusText}`);
    }
    return await result.text();
  }

  private readonly logger_: winston.Logger;
  private downloads_ = 0;
  private pending_dirs_: string[] = [];
}
