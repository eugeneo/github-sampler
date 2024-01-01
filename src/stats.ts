/* eslint-disable no-console */
import { Language } from "./validator";
import chalk from "chalk";

export enum Counters {
  TreeFiles = "tree_files",
  DatabaseFiles = "database_files",
  AlreadyDownloaded = "already_downloaded",
  Matching = "matching",
  Files = "files",
  Errors = "errors",
  Excluded = "excluded",
  NotFiles = "not_files",
  Language = "wrong_language",
  WrongSize = "wrong_size",
}

const CounterLabels: { [s in Counters]: string } = {
  [Counters.AlreadyDownloaded]: "Already downloaded",
  [Counters.DatabaseFiles]: "Files in database",
  [Counters.Errors]: "Errors",
  [Counters.Excluded]: "Files in excluded directories",
  [Counters.Files]: "Downloaded files",
  [Counters.Language]: "Language",
  [Counters.Matching]: "Files matching all criteria",
  [Counters.NotFiles]: "Not file entries",
  [Counters.TreeFiles]: "Files in repository",
  [Counters.WrongSize]: "Filtered out by size",
};

const ColumnWidth =
  Math.ceil(
    (Math.max(...Object.values(CounterLabels).map((v) => v.length)) + 2) / 8
  ) * 8;

function counterLabel(counter: Counters) {
  let result = `${CounterLabels[counter]}: `;
  for (let i = result.length; i < Math.ceil(ColumnWidth / 4) * 4; i++) {
    result += " ";
  }
  return result;
}

function counterValue(stats: Stats, counter: Counters) {
  if (counter === Counters.Language) {
    return "";
  }
  switch (counter) {
    case Counters.Errors:
      return chalk.red(stats.get(counter));
    default:
      return chalk.whiteBright(stats.get(counter));
  }
}

function counterCategories(counter: Counters): string[] {
  switch (counter) {
    case Counters.Language:
      return Object.values(Language).filter((v) => v !== Language.ALL);
    default:
      return [];
  }
}

function categoryLabel(category: string) {
  let label = `    ${category}: `;
  for (let i = label.length; i < ColumnWidth; i++) {
    label += " ";
  }
  return label;
}

export class Stats {
  constructor(private readonly languages_: Set<Language>) {}

  histogram(counter: Counters, value: string) {
    const histogram =
      this.histograms_.get(counter) ?? new Map<string, number>();
    histogram.set(value, (histogram.get(value) ?? 0) + 1);
    this.histograms_.set(counter, histogram);
  }

  increment(counter: Counters, delta = 1) {
    this.counters_.set(counter, (this.counters_.get(counter) ?? 0) + delta);
  }

  get(counter: Counters, category?: string): unknown {
    if (category) {
      return this.histograms_.get(counter)?.get(category) ?? 0;
    }
    return this.counters_.get(counter) ?? 0;
  }

  print() {
    console.info("Statistics:");
    for (const counter of Object.values(Counters)) {
      console.info(`${counterLabel(counter)}${counterValue(this, counter)}`);
      for (const category of Object.values(counterCategories(counter))) {
        console.info(
          `${categoryLabel(category)}${this.categoryValue(counter, category)}`
        );
      }
    }
  }

  private categoryValue(counter: Counters, category: string) {
    switch (counter) {
      case Counters.Language:
        const included = this.isIncludedLanguage(category);
        if (included) {
          return chalk.green(this.get(counter, category));
        } else if (included === false) {
          return chalk.red(this.get(counter, category));
        } else {
          return chalk.whiteBright(this.get(counter, category));
        }
      default:
        return "";
    }
  }

  private isIncludedLanguage(category: string) {
    if (this.languages_.size === 0 || this.languages_.has(Language.ALL)) {
      return null;
    }
    return this.languages_.has(category as Language);
  }

  private readonly counters_ = new Map<Counters, number>();
  private readonly histograms_ = new Map<Counters, Map<string, number>>();
}
