import { File } from "../src/types";

export function fakeFile(
  name: string,
  extras?: Partial<File>,
  dir = "src"
): File {
  extras = extras ?? {};
  return {
    git_url: `http://git.url/${name}`,
    name,
    path: `${dir}/${name}`,
    type: "file",
    sha: `sha${name}`,
    url: `http://url.com/${name}`,
    size: 5000,
    ...extras,
  } as File;
}

export const RepositorySrcFiles: File[] = [
  fakeFile("small_file.cc", { size: 90 }),
  fakeFile("big_file.cc", { size: 10001 }),
  fakeFile("f1.cc", { size: 100 }),
  fakeFile("f2.cc", { size: 1000 }),
  fakeFile("f3.java"),
  {
    git_url: "http://git.url/3",
    name: "dir1",
    path: "src/dir1",
    type: "dir",
    sha: "sha3",
    url: "http://url.com/3",
    size: 0,
  },
  {
    git_url: "http://git.url/4",
    name: "dir2",
    path: "src/dir2",
    type: "dir",
    sha: "sha4",
    url: "http://url.com/4",
    size: 0,
  },
];
