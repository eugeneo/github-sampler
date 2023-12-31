import { ContentsResponse, File, Repository } from "./types";

import { Tree, TreeSchema } from "./database";

export interface GithubApi {
  downloadFile(url: string): Promise<string>;
  fetchTree(repository: Repository, sha: string): Promise<Tree>;
}

export class GithubApiImpl implements GithubApi {
  constructor(private readonly githubToken: string) {}

  async fetchTree(repository: Repository, sha: string) {
    return TreeSchema.parse(
      JSON.parse(
        await this.githubRequest(
          `https://api.github.com/repos/${repository.owner}/${repository.name}/git/trees/${sha}?recursive=1`
        )
      )
    );
  }

  async listFiles(repository: Repository, path: string | null) {
    return ContentsResponse.parse(
      JSON.parse(
        await this.githubRequest(
          `https://api.github.com/repos/${repository.owner}/${
            repository.name
          }/contents/${path?.trim() ? path.trim() : ""}`
        )
      )
    );
  }

  async downloadFile(url: string): Promise<string> {
    const contents = await this.githubRequest(
      url,
      "application/vnd.github.raw"
    );
    console.log(contents);
    throw new Error("Implement saving the file!");
  }

  private async githubRequest(
    url: string,
    contentType = "application/vnd.github+json"
  ) {
    const result = await fetch(url, {
      headers: {
        Accept: contentType,
        Authorization: `Bearer ${this.githubToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!result.ok) {
      throw new Error(`Failed to fetch ${url}: ${result.statusText}`);
    }
    return await result.text();
  }
}
