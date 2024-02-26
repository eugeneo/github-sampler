import * as z from "zod";

export const File = z.object({
  git_url: z.string(),
  name: z.string(),
  path: z.string(),
  type: z.enum(["file", "dir"]),
  sha: z.string(),
  url: z.string(),
  size: z.number().optional(),
});

export type File = z.infer<typeof File>;

export const ContentsResponse = z.array(File);

export enum Language {
  ALL = "all",
  CPP = "cpp",
  JAVA = "java",
  PYTHON = "python",
  JAVASCRIPT = "javascript",
  TYPESCRIPT = "typescript",
  GO = "go",
  RUST = "rust",
  UNKNOWN = "unknown",
}

export type Repository = {
  owner: string;
  name: string;
};
