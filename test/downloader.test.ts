import { Downloader } from "../src/downloader";
import { GithubApi } from "../src/github_api";
import { File, Language, Repository } from "../src/types";

import { fakeFile } from "../test/test_data";

const NullKey = "<null>";
const DEFAULT_REPO: Repository = { owner: "owner", name: "repo" };

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

function fileIndexEntry(name: string, error?: string) {
  const { git_url, path, sha, ...rest } = fakeFile(name);
  const error_or_destination = error
    ? { error }
    : { destination: `sha${name}` };
  return {
    ...rest,
    ...error_or_destination,
    language: Language.CPP,
  };
}

function setupMockGithubApi(
  dirOverrides?: Record<string, File[] | Error>,
  fileOverrides?: Record<string, string | Error>,
  expectedRepo = DEFAULT_REPO
) {
  const mockGithubApi: jest.MockedObject<GithubApi> = {
    downloadFile: jest.fn(),
    listFiles: jest.fn(),
  };
  mockGithubApi.listFiles.mockImplementation(async (repo, path) => {
    expect(repo).toEqual(expectedRepo);
    return safeGet(
      {
        ...{
          "<null>": [
            fakeFile("f1.cc", {}, ""),
            fakeFile("f2.cc", {}, ""),
            fakeFile("dir1", { type: "dir" }, ""),
          ],
          "/dir1": [fakeFile("f3.cc", {}, "dir1")],
        },
        ...(dirOverrides ?? {}),
      },
      path
    );
  });
  mockGithubApi.downloadFile.mockImplementation(({ path }: File) =>
    safeGet(
      {
        ...{
          "/f1.cc": "f1.cc_contents",
          "/f2.cc": "f2.cc_contents",
          "dir1/f3.cc": "f3.cc_contents",
        },
        ...(fileOverrides ?? {}),
      },
      path
    )
  );
  return mockGithubApi;
}

function mockDownloader(
  { sha }: File,
  contents: string
): Promise<[string, string]> {
  return Promise.resolve([sha, contents]);
}

describe("Downloader", () => {
  it("downloads repository root", async () => {
    const mockGithubApi = setupMockGithubApi();
    const store = jest.fn(mockDownloader);
    const downloader = new Downloader(
      mockGithubApi,
      store,
      { files: {}, visited: [], known: {} },
      {
        maxSize: 10000,
        minSize: 0,
        languages: new Set([Language.CPP]),
      }
    );
    await expect(
      downloader.processRepository(DEFAULT_REPO, null)
    ).resolves.toEqual({
      files: {
        "shaf1.cc": fileIndexEntry("f1.cc"),
        "shaf2.cc": fileIndexEntry("f2.cc"),
        "shaf3.cc": fileIndexEntry("f3.cc"),
      },
      visited: [],
      known: {},
    });
    expect(mockGithubApi.listFiles).toHaveBeenCalledWith(DEFAULT_REPO, null);
    expect(mockGithubApi.listFiles).toHaveBeenCalledWith(DEFAULT_REPO, "/dir1");
    expect(mockGithubApi.listFiles).toHaveBeenCalledTimes(2);
    expect(mockGithubApi.downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/f1.cc" })
    );
    expect(mockGithubApi.downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/f2.cc" })
    );
    expect(mockGithubApi.downloadFile).toHaveBeenCalledTimes(3);
    expect(store).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/f1.cc" }),
      "f1.cc_contents"
    );
    expect(store).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/f2.cc" }),
      "f2.cc_contents"
    );
    expect(store).toHaveBeenCalledTimes(3);
  });

  it("failure to download a dir is ignored", async () => {
    const mockGithubApi = setupMockGithubApi({
      "/dir1": new Error("Failed to list dir"),
    });
    const store = jest.fn(mockDownloader);
    const downloader = new Downloader(
      mockGithubApi,
      store,
      { files: {}, visited: [], known: {} },
      {
        maxSize: 10000,
        minSize: 0,
        languages: new Set([Language.CPP]),
      }
    );
    await expect(
      downloader.processRepository(DEFAULT_REPO, null)
    ).resolves.toEqual({
      files: {
        "shaf1.cc": fileIndexEntry("f1.cc"),
        "shaf2.cc": fileIndexEntry("f2.cc"),
      },
      visited: [],
      known: {},
    });
  });

  it("failure to download a file is ignored", async () => {
    const mockGithubApi = setupMockGithubApi(
      {},
      {
        "/f2.cc": new Error("Failed to download file"),
      }
    );
    const store = jest.fn(mockDownloader);
    const downloader = new Downloader(
      mockGithubApi,
      store,
      { files: {}, visited: [], known: {} },
      {
        maxSize: 10000,
        minSize: 0,
        languages: new Set([Language.CPP]),
      }
    );
    await expect(
      downloader.processRepository(DEFAULT_REPO, null)
    ).resolves.toEqual({
      files: {
        "shaf1.cc": fileIndexEntry("f1.cc"),
        "shaf2.cc": fileIndexEntry("f2.cc", "Failed to download file"),
        "shaf3.cc": fileIndexEntry("f3.cc"),
      },
      visited: [],
      known: {},
    });
  });

  it("failure to save a file is ignored", async () => {
    const mockGithubApi = setupMockGithubApi();
    const store = jest.fn((...args: Parameters<typeof mockDownloader>) => {
      if (args[0].path === "/f2.cc") {
        throw new Error("Failed to save file");
      }
      return mockDownloader(...args);
    });
    const downloader = new Downloader(
      mockGithubApi,
      store,
      { files: {}, visited: [], known: {} },
      {
        maxSize: 10000,
        minSize: 0,
        languages: new Set([Language.CPP]),
      }
    );
    await expect(
      downloader.processRepository(DEFAULT_REPO, null)
    ).resolves.toEqual({
      files: {
        "shaf1.cc": fileIndexEntry("f1.cc"),
        "shaf2.cc": fileIndexEntry("f2.cc", "Failed to save file"),
        "shaf3.cc": fileIndexEntry("f3.cc"),
      },
      visited: [],
      known: {},
    });
  });

  it.skip("does not redownload files in index", async () => {
    const mockGithubApi = setupMockGithubApi();
    const store = jest.fn(mockDownloader);
    const downloader = new Downloader(
      mockGithubApi,
      store,
      {
        files: {
          "shaf2.cc": {
            type: "file",
            name: "f2.cc",
            destination: "f2.cc",
            language: Language.CPP,
            size: 100,
            url: "http://url.com/f2.cc",
          },
        },
        visited: [],
        known: {},
      },
      {
        maxSize: 10000,
        minSize: 0,
        languages: new Set([Language.CPP]),
      }
    );
    await expect(
      downloader.processRepository(DEFAULT_REPO, null)
    ).resolves.toEqual({
      files: {
        "shaf1.cc": fileIndexEntry("f1.cc"),
        "shaf3.cc": fileIndexEntry("f3.cc"),
      },
      visited: [],
      known: {},
    });
  });

  it.skip("can start at a subdirectory", async () => {});
  it.skip("downloads only some files", async () => {});
  it.skip("stops when enough files are downloaded", async () => {});
});
