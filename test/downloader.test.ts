import { Database, Entry, Tree } from "../src/database";
import { Downloader } from "../src/downloader";
import { GithubApi } from "../src/github";
import { Language, Repository } from "../src/validator";

const NullKey = "<null>";
const DEFAULT_REPO: Repository = { owner: "owner", name: "repo" };

function fakeEntry(path: string, overrides?: Partial<Entry>): Entry {
  return {
    path,
    sha: `sha${path}`,
    type: "blob",
    size: 100,
    url: `http://example.com/${path}`,
    mode: "100644",
    ...(overrides ?? {}),
  };
}

function fakeTree(...entries: (Entry | string)[]): Tree {
  return {
    tree: entries.map((entry) =>
      typeof entry === "string" ? fakeEntry(entry) : entry
    ),
    sha: "sha",
    url: `http://example.com/url`,
    truncated: false,
  };
}

async function safeGet<T>(map: Record<string, T | Error>, key: string | null) {
  const value = map[key ?? NullKey];
  if (value instanceof Error) {
    throw value;
  }
  if (value === undefined) {
    throw new Error(`No value for key ${key}`);
  }
  return value;
}

function mockDownloader(category: string, { sha }: Entry, contents: string) {
  return `${category}/${sha}/${contents}`;
}

function fileIndexEntry(
  name: string,
  category = "cpp",
  error?: string
): Database[string] {
  const entry = fakeEntry(name);
  const error_or_destination = error
    ? { error }
    : { destination: mockDownloader(category, entry, `${name}_contents`) };
  return {
    ...entry,
    ...error_or_destination,
    type: "blob" as const,
    language: Language.CPP,
  };
}

function setupMockGithubApi(
  treeOverrides?: Record<string, Tree | Error>,
  fileOverrides?: Record<string, string | Error>,
  expectedRepo = DEFAULT_REPO
) {
  const mockGithubApi: jest.MockedObject<GithubApi> = {
    downloadFile: jest.fn(),
    fetchTree: jest.fn(),
  };
  mockGithubApi.downloadFile.mockImplementation(async (url) =>
    safeGet(
      {
        ...{
          "f1.cc": "f1.cc_contents",
          "f2.cc": "f2.cc_contents",
          "dir1/f3.cc": "dir1/f3.cc_contents",
        },
        ...(fileOverrides ?? {}),
      },
      url.replace(/http:\/\/example.com\//, "")
    )
  );
  mockGithubApi.fetchTree.mockImplementation(async (repo, sha) => {
    expect(repo).toEqual(expectedRepo);
    return safeGet(
      {
        master: fakeTree(
          "f1.cc",
          "f2.cc",
          fakeEntry("dir1", { type: "tree" }),
          "dir1/f3.cc"
        ),
        ...treeOverrides,
      },
      sha
    );
  });
  return mockGithubApi;
}

describe("Downloader", () => {
  it("downloads repository root", async () => {
    const mockGithubApi = setupMockGithubApi();
    const store = jest.fn(mockDownloader);
    const downloader = new Downloader(
      mockGithubApi,
      (...args) => Promise.resolve(store(...args)),
      {},
      {
        maxSize: 10000,
        minSize: 0,
        languages: new Set([Language.CPP]),
      }
    );
    await expect(
      downloader.processRepository(DEFAULT_REPO, "master")
    ).resolves.toEqual({
      "shaf1.cc": fileIndexEntry("f1.cc"),
      "shaf2.cc": fileIndexEntry("f2.cc"),
      "shadir1/f3.cc": fileIndexEntry("dir1/f3.cc"),
    });
    expect(mockGithubApi.fetchTree).toHaveBeenCalledWith(
      DEFAULT_REPO,
      "master"
    );
    expect(mockGithubApi.fetchTree).toHaveBeenCalledTimes(1);
    expect(mockGithubApi.downloadFile).toHaveBeenCalledWith(
      "http://example.com/f1.cc"
    );
    expect(mockGithubApi.downloadFile).toHaveBeenCalledWith(
      "http://example.com/f2.cc"
    );
    expect(mockGithubApi.downloadFile).toHaveBeenCalledWith(
      "http://example.com/dir1/f3.cc"
    );
    expect(mockGithubApi.downloadFile).toHaveBeenCalledTimes(3);
    expect(store).toHaveBeenCalledWith(
      "cpp",
      expect.objectContaining({ path: "f1.cc" }),
      "f1.cc_contents"
    );
    expect(store).toHaveBeenCalledWith(
      "cpp",
      expect.objectContaining({ path: "f2.cc" }),
      "f2.cc_contents"
    );
    expect(store).toHaveBeenCalledWith(
      "cpp",
      expect.objectContaining({ path: "dir1/f3.cc" }),
      "dir1/f3.cc_contents"
    );
    expect(store).toHaveBeenCalledTimes(3);
  });

  it("failure to download a file is ignored", async () => {
    const mockGithubApi = setupMockGithubApi(
      {},
      { "f2.cc": new Error("Failed to download file") }
    );
    const store = jest.fn(mockDownloader);
    const downloader = new Downloader(
      mockGithubApi,
      (...args) => Promise.resolve(store(...args)),
      {},
      {
        maxSize: 10000,
        minSize: 0,
        languages: new Set([Language.CPP]),
      }
    );
    await expect(
      downloader.processRepository(DEFAULT_REPO, "master")
    ).resolves.toEqual({
      "shaf1.cc": fileIndexEntry("f1.cc"),
      "shaf2.cc": fileIndexEntry("f2.cc", "cpp", "Failed to download file"),
      "shadir1/f3.cc": fileIndexEntry("dir1/f3.cc"),
    });
  });

  it("failure to save a file is ignored", async () => {
    const mockGithubApi = setupMockGithubApi();
    const store = jest.fn(mockDownloader);
    const downloader = new Downloader(
      mockGithubApi,
      async (category, file, contents) => {
        if (file.path === "f2.cc") {
          throw new Error("Failed to save file");
        }
        return store(category, file, contents);
      },
      {},
      {
        maxSize: 10000,
        minSize: 0,
        languages: new Set([Language.CPP]),
      }
    );
    await expect(
      downloader.processRepository(DEFAULT_REPO, "master")
    ).resolves.toEqual({
      "shaf1.cc": fileIndexEntry("f1.cc"),
      "shaf2.cc": fileIndexEntry("f2.cc", "cpp", "Failed to save file"),
      "shadir1/f3.cc": fileIndexEntry("dir1/f3.cc"),
    });
  });

  it("does not redownload files in index", async () => {
    const mockGithubApi = setupMockGithubApi();
    const store = jest.fn(mockDownloader);
    const downloader = new Downloader(
      mockGithubApi,
      (...args) => Promise.resolve(store(...args)),
      {
        "shaf2.cc": fileIndexEntry("f2.cc"),
      },
      {
        maxSize: 10000,
        minSize: 0,
        languages: new Set([Language.CPP]),
      }
    );
    await expect(
      downloader.processRepository(DEFAULT_REPO, "master")
    ).resolves.toEqual({
      "shaf1.cc": fileIndexEntry("f1.cc"),
      "shaf2.cc": fileIndexEntry("f2.cc"),
      "shadir1/f3.cc": fileIndexEntry("dir1/f3.cc"),
    });
    expect(mockGithubApi.downloadFile).not.toHaveBeenCalledWith(
      "http://example.com/f2.cc"
    );
    expect(store).not.toHaveBeenCalledWith(
      expect.objectContaining({ sha: "shaf2.cc" }),
      "f2.cc_contents"
    );
  });

  it("download the dir", async () => {
    const mockGithubApi = setupMockGithubApi({
      boop: fakeTree(
        "f1.cc",
        "f2.cc",
        fakeEntry("dir1", { type: "tree" }),
        "dir1/f3.cc",
        "dir11/a.cc"
      ),
    });
    const store = jest.fn(mockDownloader);
    const downloader = new Downloader(
      mockGithubApi,
      (...args) => Promise.resolve(store(...args)),
      {},
      {
        maxSize: 10000,
        minSize: 0,
        languages: new Set([Language.CPP]),
        dirs: ["dir1"],
      }
    );
    await expect(
      downloader.processRepository(DEFAULT_REPO, "boop")
    ).resolves.toEqual({
      "shadir1/f3.cc": fileIndexEntry("dir1/f3.cc"),
    });
  });

  it("failure to download index throws", async () => {
    const mockGithubApi = setupMockGithubApi({
      master: new Error("Failed to download index"),
    });
    const store = jest.fn(mockDownloader);
    const downloader = new Downloader(
      mockGithubApi,
      (...args) => Promise.resolve(store(...args)),
      {},
      {
        maxSize: 10000,
        minSize: 0,
        languages: new Set([Language.CPP]),
      }
    );
    await expect(
      downloader.processRepository(DEFAULT_REPO, "master")
    ).rejects.toThrow("Failed to download index");
  });

  it("downloads only some files, ignoring failures", async () => {
    const mockGithubApi = setupMockGithubApi(
      {
        b: fakeTree("a.cc", "b.cc", "c.cc", "d.cc"),
      },
      {
        "a.cc": new Error("Failed to download file"),
        "d.cc": new Error("Failed to download file"),
      }
    );
    const store = jest.fn(mockDownloader);
    const downloader = new Downloader(
      mockGithubApi,
      (...args) => Promise.resolve(store(...args)),
      {},
      {
        maxSize: 10000,
        minSize: 0,
        languages: new Set([Language.CPP]),
        maxFiles: 2,
      }
    );
    const files = await downloader.processRepository(DEFAULT_REPO, "master");
    expect(Object.keys(files)).toHaveLength(2);
  });

  it("downloads all files if max file is too big", async () => {
    const mockGithubApi = setupMockGithubApi();
    const store = jest.fn(mockDownloader);
    const downloader = new Downloader(
      mockGithubApi,
      (...args) => Promise.resolve(store(...args)),
      {},
      {
        maxSize: 10000,
        minSize: 0,
        languages: new Set([Language.CPP]),
        maxFiles: 50,
      }
    );
    const files = await downloader.processRepository(DEFAULT_REPO, "master");
    expect(Object.keys(files)).toHaveLength(3);
  });

  it("handles when nothing to download", async () => {
    const mockGithubApi = setupMockGithubApi({ k: fakeTree() });
    const store = jest.fn(mockDownloader);
    const downloader = new Downloader(
      mockGithubApi,
      (...args) => Promise.resolve(store(...args)),
      {},
      {
        maxSize: 10000,
        minSize: 0,
        languages: new Set([Language.CPP]),
      }
    );
    const files = await downloader.processRepository(DEFAULT_REPO, "k");
    expect(Object.keys(files)).toHaveLength(0);
  });

  it("files not matching criteria", async () => {
    const mockGithubApi = setupMockGithubApi(
      {
        t: fakeTree(
          fakeEntry("f1.java", { size: 500 }),
          fakeEntry("too_small.java", { size: 250 }),
          fakeEntry("too_big.java", { size: 1050 }),
          fakeEntry("f1.cpp", { size: 500 }),
          fakeEntry("f2.java", { type: "tree", size: 500 })
        ),
      },
      { "f1.java": "f1.java_contents" }
    );
    const store = jest.fn(mockDownloader);
    const downloader = new Downloader(
      mockGithubApi,
      (...args) => Promise.resolve(store(...args)),
      {},
      {
        maxSize: 1000,
        minSize: 300,
        languages: new Set([Language.JAVA]),
      }
    );
    await expect(
      downloader.processRepository(DEFAULT_REPO, "t")
    ).resolves.toEqual({
      "shaf1.java": {
        ...fileIndexEntry("f1.java", "java"),
        language: "java",
        size: 500,
      },
    });
  });
});
