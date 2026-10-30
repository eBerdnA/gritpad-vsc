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
    Array<{ entry: TabLabelCandidate; pattern: string; title?: string }>
  >();
  const skipped: SkippedTabLabel[] = [];

  for (const entry of entries) {
    if (!entry.workspaceFolderPath) {
      skipped.push({ path: entry.path, reason: "The file is outside the current workspace." });
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
    samePattern.push({ entry, pattern, title: entry.title });
    candidates.set(collisionKey, samePattern);
  }

  const rules = new Map<string, string>();
  for (const samePattern of candidates.values()) {
    const eligible: Array<{ entry: TabLabelCandidate; pattern: string; title: string }> = [];
    for (const candidate of samePattern) {
      const { title } = candidate;
      if (!title) {
        continue;
      }
      let reason: string | undefined;
      if (!supportedTitleCharacters.test(title)) {
        reason = "VS Code requires an ASCII letter or digit in a custom tab label.";
      } else if (templateExpression.test(title)) {
        reason = "The title contains syntax that VS Code interprets as a label template.";
      } else if (/[\u0000-\u001f\u007f]/.test(title)) {
        reason = "The title contains control characters that are unsafe for a tab label.";
      }
      if (reason) {
        skipped.push({ path: candidate.entry.path, reason });
      } else {
        eligible.push({ ...candidate, title });
      }
    }

    if (eligible.length !== samePattern.length) {
      if (eligible.length > 0) {
        for (const candidate of eligible) {
          skipped.push({
            path: candidate.entry.path,
            reason: "Another workspace file has the same case-insensitive exact pattern but cannot be safely labeled.",
          });
        }
      }
      continue;
    }

    const titles = new Set(eligible.map((candidate) => candidate.title));
    if (titles.size > 1) {
      for (const candidate of eligible) {
        skipped.push({
          path: candidate.entry.path,
          reason: "Another workspace file has the same case-insensitive exact pattern but a different title.",
        });
      }
      continue;
    }
    rules.set(eligible[0].pattern, eligible[0].title);
  }

  return { rules, skipped };
}
