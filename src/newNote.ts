import { randomUUID } from "node:crypto";
import { stringify } from "yaml";
import { formatModifiedTimestamp } from "./modified";

export function buildNewNote(title: string, date = new Date()): { id: string; contents: string } {
  const trimmed = title.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) {
    throw new Error("A note title must be a nonempty single line.");
  }
  const id = randomUUID();
  const timestamp = formatModifiedTimestamp(date);
  const frontmatter = stringify({ id, title: trimmed, created: timestamp, modified: timestamp }, { lineWidth: 0 });
  return { id, contents: `---\n${frontmatter}---\n\n` };
}
