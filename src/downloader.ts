import chalk from 'chalk';
import { Database, Entry } from './database';
import { GithubApi } from './github';
import { Language } from './validator';
import path from 'path';
import z from 'zod';

export type DownloaderOptions = {
  dirs?: string[];
  logSkipped?: boolean;
};

function getFileLanguage(filePath: string): Language {
  switch (path.extname(filePath)) {
    case '.cpp':
    case '.cc':
    case '.c':
    case '.h':
    case '.hpp':
    case '.cxx':
    case '.hxx':
    case '.c++':
    case '.h++':
    case '.hh':
    case '.hcc':
    case '.inl':
    case '.ipp':
    case '.tcc':
    case '.tpp':
    case '.txx':
      return Language.CPP;
    case '.java':
      return Language.JAVA;
    case '.py':
      return Language.PYTHON;
    case '.mjs':
    case '.js':
    case '.cjs':
    case '.jsx':
      return Language.JAVASCRIPT;
    case '.ts':
    case '.tsx':
      return Language.TYPESCRIPT;
    case '.go':
      return Language.GO;
    case '.rs':
      return Language.RUST;
  }
  return Language.UNKNOWN;
}

export const ProjectSchema = z.array(
  z.object({
    github: z.string(),
    branch: z.string().optional().default('master'),
    files: z.record(
      z.nativeEnum(Language),
      z.union([
        z.number().positive().int(),
        z.object({
          count: z.number().positive().int(),
          minSize: z.number().optional().default(0),
          maxSize: z.number().optional().default(Number.POSITIVE_INFINITY),
          include: z.array(z.string()).optional().default([]),
          exclude: z.array(z.string()).optional().default([]),
        }),
      ]),
    ),
  }),
);
type ProjectSchema = z.infer<typeof ProjectSchema>;

type Stats = {
  total: number;
  toDownload: number;
  badDir: number;
  badSize: number;
  included: boolean;
};

function formatStats(language: string, stats: Stats) {
  const color = stats.included ? chalk.green : chalk.gray;
  return `    ${color(language.padEnd(15))} ${String(stats.total).padEnd(
    6,
  )} ${String(stats.toDownload).padEnd(6)} ${String(stats.badDir).padEnd(
    6,
  )} ${String(stats.badSize).padEnd(6)}`;
}

export type DownloadableEntry = Entry & {
  language: Language;
  repository: string;
  branch: string;
  url: string;
};

export class Downloader {
  constructor(
    private githubApi: GithubApi,
    private readonly database: Database,
  ) {}

  async prepareFileList(
    project: ProjectSchema[number],
  ): Promise<DownloadableEntry[]> {
    const index = await this.githubApi.fetchTree(
      project.github,
      project.branch,
    );
    const byLanguage = {} as Record<Language, (Entry & { url: string })[]>;
    const langStats = {} as Record<Language, Stats>;
    for (const entry of index.tree) {
      if (entry.type !== 'blob') {
        continue;
      }
      if (entry.url === undefined) {
        continue;
      }
      const language = getFileLanguage(entry.path);
      const perLang = project.files[language];
      if (langStats[language] === undefined) {
        langStats[language] = {
          total: 1,
          included: perLang !== undefined,
          badDir: 0,
          badSize: 0,
          toDownload: 0,
        };
      } else {
        langStats[language].total++;
      }
      if (perLang === undefined) {
        continue;
      }
      if (byLanguage[language] === undefined) {
        byLanguage[language] = [];
      }
      if (perLang instanceof Object) {
        const included =
          (perLang.include.length === 0 ||
            perLang.include.some((dir) => entry.path.startsWith(dir))) &&
          (perLang.exclude.length === 0 ||
            !perLang.exclude.some((dir) => entry.path.startsWith(dir)));
        if (!included) {
          langStats[language].badDir++;
          continue;
        }
        if (
          !entry.size ||
          entry.size < perLang.minSize ||
          entry.size > perLang.maxSize
        ) {
          langStats[language].badSize++;
          continue;
        }
      }
      byLanguage[language].push(entry as Entry & { url: string });
    }
    const result = [] as DownloadableEntry[];
    for (const [lang, info] of Object.entries(project.files)) {
      const count = info instanceof Object ? info.count : info;
      const ents = byLanguage[lang as Language];
      // shuffle!
      for (let i = ents.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ents[i], ents[j]] = [ents[j], ents[i]];
      }
      langStats[lang as Language].toDownload = count;
      result.push(
        ...ents.slice(0, count).map((entry) => ({
          ...entry,
          language: lang as Language,
          repository: project.github,
          branch: project.branch,
        })),
      );
    }
    console.info(
      `Repository ${project.github}\n${Object.entries(langStats)
        .map(([lang, data]) => formatStats(lang, data))
        .sort()
        .join('\n')}`,
    );
    result.sort(({ sha: shaA }, { sha: shaB }) => shaA.localeCompare(shaB));
    return result;
  }
}
