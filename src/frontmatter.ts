import { parseDocument } from "yaml";

export interface FrontmatterTitle {
  title?: string;
  error?: string;
}

const openingDelimiter = /^\uFEFF?---[ \t]*\r?\n/;
const closingDelimiter = /\r?\n---[ \t]*(?:\r?\n|$)/;

export function readFrontmatterTitle(contents: string): FrontmatterTitle {
  const opening = openingDelimiter.exec(contents);
  if (!opening) {
    return {};
  }

  const remainder = contents.slice(opening[0].length);
  const closing = closingDelimiter.exec(remainder);
  if (!closing) {
    return { error: "Frontmatter is missing its closing --- delimiter." };
  }

  const document = parseDocument(remainder.slice(0, closing.index), {
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
