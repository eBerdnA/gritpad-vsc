import { parseDocument } from "yaml";

export interface FrontmatterTitle {
  title?: string;
  error?: string;
}

const openingDelimiter = /^\uFEFF?---[ \t]*\r?\n/;
const closingDelimiter = /(?:^|\r?\n)---[ \t]*(?:\r?\n|$)/;

export function getFrontmatterBlock(contents: string): { yaml: string; offset: number } | { error: string } | undefined {
  const opening = openingDelimiter.exec(contents);
  if (!opening) {
    return undefined;
  }
  const remainder = contents.slice(opening[0].length);
  const closing = closingDelimiter.exec(remainder);
  if (!closing) {
    return { error: "Frontmatter is missing its closing --- delimiter." };
  }
  return { yaml: remainder.slice(0, closing.index), offset: opening[0].length };
}

export function readFrontmatterTitle(contents: string): FrontmatterTitle {
  const block = getFrontmatterBlock(contents);
  if (!block) {
    return {};
  }
  if ("error" in block) {
    return block;
  }
  const document = parseDocument(block.yaml, {
    uniqueKeys: true,
    prettyErrors: false,
  });
  if (document.errors.length > 0) {
    return { error: document.errors.map((error) => error.message).join("; ") };
  }

  let data: unknown;
  try {
    data = document.toJS();
  } catch (error) {
    return { error: `Unable to interpret YAML frontmatter: ${String(error)}` };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }

  const title = (data as Record<string, unknown>).title;
  if (typeof title !== "string") {
    return {};
  }

  const trimmedTitle = title.trim();
  return trimmedTitle ? { title: trimmedTitle } : {};
}
