import * as path from "node:path";

export interface TabLabelRule {
  pattern: string;
  title: string;
}

export interface TabLabelCandidate {
  path: string;
  uriPath: string;
  workspaceFolderPath?: string;
  title?: string;
}

export interface SkippedTabLabel {
  path: string;
  reason: string;
}

export interface TabLabelRuleSet {
  rules: Map<string, string>;
  skipped: SkippedTabLabel[];
}

const globMetacharacters = /[*?{}\[\]]/;
const templateExpression = /\$\{(?:dirname|filename|extname)(?:\([^}]*\))?\}/;
const supportedTitleCharacters = /[a-zA-Z0-9]/;

export function createTabLabelRules(
  entries: TabLabelCandidate[],
): TabLabelRuleSet {
  const candidates = new Map<
    string,
    Array<{ entry: TabLabelCandidate; pattern: string; title: string }>
  >();
  const skipped: SkippedTabLabel[] = [];

  for (const entry of entries) {
    const title = entry.title;
    if (!title) {
      continue;
    }
    if (!entry.workspaceFolderPath) {
      skipped.push({ path: entry.path, reason: "The file is outside the current workspace." });
      continue;
    }
    if (!supportedTitleCharacters.test(title)) {
      skipped.push({
        path: entry.path,
        reason: "VS Code requires an ASCII letter or digit in a custom tab label.",
      });
      continue;
    }
    if (templateExpression.test(title)) {
      skipped.push({
        path: entry.path,
        reason: "The title contains syntax that VS Code interprets as a label template.",
      });
      continue;
    }
    if (/[\u0000-\u001f\u007f]/.test(title)) {
      skipped.push({
        path: entry.path,
        reason: "The title contains control characters that are unsafe for a tab label.",
      });
      continue;
    }

    const pattern = path.posix.relative(
      path.posix.dirname(entry.workspaceFolderPath),
      entry.uriPath,
    );
    if (
      !pattern ||
      pattern.startsWith("../") ||
      path.posix.isAbsolute(pattern) ||
      globMetacharacters.test(pattern)
    ) {
      skipped.push({
        path: entry.path,
        reason: "The file path cannot be represented as a safe exact VS Code glob pattern.",
      });
      continue;
    }

    const collisionKey = pattern.toLowerCase();
    const samePattern = candidates.get(collisionKey) ?? [];
    samePattern.push({ entry, pattern, title });
    candidates.set(collisionKey, samePattern);
  }

  const rules = new Map<string, string>();
  for (const samePattern of candidates.values()) {
    const titles = new Set(samePattern.map((candidate) => candidate.title));
    if (titles.size > 1) {
      for (const candidate of samePattern) {
        skipped.push({
          path: candidate.entry.path,
          reason: "Another workspace file has the same case-insensitive exact pattern but a different title.",
        });
      }
      continue;
    }
    rules.set(samePattern[0].pattern, samePattern[0].title);
  }

  return { rules, skipped };
}
