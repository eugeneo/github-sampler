import * as z from "zod";

export const File = z.object({
  git_url: z.string(),
  name: z.string(),
  path: z.string(),
  type: z.enum(["file", "dir"]),
  sha: z.string(),
  url: z.string(),
  size: z.number(),
});

export type File = z.infer<typeof File>;

export const ContentsResponse = z.array(File);

export enum Language {
  ALL = "all",
  UNKNOWN = "unknown",
  CPP = "cpp",
  JAVA = "java",
}

export type Repository = {
  owner: string;
  name: string;
};
