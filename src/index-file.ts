import { stat, readFile } from "fs/promises";
import path from "path";

import * as z from "zod";

import { getLogger } from "./logger.js";

const IndexParser = z.object({
  dirs: z.array(
    z.object({ name: z.string(), path: z.string(), gitUrl: z.string() })
  ),
});

type Index = z.infer<typeof IndexParser>;

export async function getIndex(repo: string, dir: string) {
  if (repo.indexOf("/") === -1) {
    throw new Error("Repository must be in the format owner/repo");
  }
  const [owner, repository] = repo.split("/");
  const logger = getLogger("index-file");
  const indexFilePath = path.join(dir, `${owner}-${repository}.index.json`);
  logger.info(`Index file: ${indexFilePath}`);
  try {
    const stats = await stat(indexFilePath);
    let index = IndexParser.parse(
      JSON.parse(await readFile(indexFilePath, "utf-8"))
    );
  } catch (e) {
    const { code } = e as { code?: string };
    if (code !== "ENOENT") {
      throw e;
    }
    logger.debug(
      `Index file ${indexFilePath} does not exist, a new one will be created`
    );
  }
}
