import z from "zod";

const EntrySchema = z.object({
  path: z.string(),
  mode: z.string(),
  type: z.enum(["blob", "tree", "commit"]),
  size: z.number(),
  sha: z.string(),
  url: z.string(),
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
