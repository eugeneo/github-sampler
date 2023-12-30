import z from "zod";

import { Language } from "./types";

// Zod is weird
const languages = Object.values(Language).filter((v) => v !== Language.ALL) as [
  string,
  ...string[]
];

const FileSchema = z.object({
  type: z.literal("file"),
  name: z.string(),
  language: z.enum(languages),
  size: z.number(),
  url: z.string(),
});

export type FileRecord = z.infer<typeof FileSchema>;

export const DatabaseSchema = z.object({
  files: z.record(
    z.intersection(
      FileSchema,
      z.union([
        z.object({ destination: z.string() }),
        z.object({ error: z.string() }),
      ])
    )
  ),
  visited: z.array(z.string()),
  known: z.record(FileSchema),
});

export type Database = z.infer<typeof DatabaseSchema>;
