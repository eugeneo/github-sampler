import { mkdir, readFile, writeFile } from "fs/promises";
import pathUtil from "path";
import z from "zod";

const EntrySchema = z.object({
  path: z.string(),
  mode: z.string(),
  type: z.enum(["blob", "tree", "commit"]),
  size: z.number().optional(),
  sha: z.string(),
  url: z.string().optional(),
});

export const TreeSchema = z.object({
  sha: z.string(),
  url: z.string(),
  truncated: z.boolean(),
  tree: z.array(EntrySchema),
});

export type Tree = z.infer<typeof TreeSchema>;

export type Entry = z.infer<typeof EntrySchema>;

export const DatabaseSchema = z.record(
  z.intersection(
    EntrySchema,
    z.intersection(
      z.union([
        z.object({ destination: z.string() }),
        z.object({ error: z.string() }),
      ]),
      z.object({ language: z.string() })
    )
  )
);

export type Database = z.infer<typeof DatabaseSchema>;

export async function loadDatabase(path: string): Promise<Database> {
  try {
    const content = await readFile(path, "utf-8");
    return DatabaseSchema.parse(JSON.parse(content));
  } catch (e) {
    if ((e as { code?: string }).code === "ENOENT") {
      return {};
    }
    throw e;
  }
}

export async function saveDatabase(path: string, database: Database) {
  await mkdir(pathUtil.dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(database, null, 2));
}
