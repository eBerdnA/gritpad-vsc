import { isMap, isScalar, parseDocument } from "yaml";
import { getFrontmatterBlock } from "./frontmatter";

export interface ModifiedEdit {
  start: number;
  end: number;
  text: string;
}

export function formatModifiedTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const zone = `${offset < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(offset) / 60))}${pad(Math.abs(offset) % 60)}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${zone}`;
}

export function getModifiedEdit(
  contents: string,
  date: Date,
): { edit?: ModifiedEdit; error?: string } {
  const block = getFrontmatterBlock(contents);
  if (!block) {
    return {};
  }
  if ("error" in block) {
    return block;
  }
  const document = parseDocument(block.yaml, { uniqueKeys: true, prettyErrors: false });
  if (document.errors.length > 0) {
    return { error: document.errors.map((error) => error.message).join("; ") };
  }
  if (!isMap(document.contents)) {
    return {};
  }
  const pair = document.contents.items.find(
    (item) => isScalar(item.key) && item.key.value === "modified",
  );
  if (!pair) {
    return {};
  }
  const value = pair.value;
  if (
    !isScalar(value) || typeof value.value !== "string" || !value.range ||
    !["PLAIN", "QUOTE_SINGLE", "QUOTE_DOUBLE"].includes(value.type ?? "") ||
    /[\r\n]/.test(block.yaml.slice(value.range[0], value.range[1])) ||
    value.anchor || value.tag
  ) {
    return { error: "The existing modified value must be an untagged, single-line YAML string (plain or quoted)." };
  }
  const timestamp = formatModifiedTimestamp(date);
  const quote = value.type === "QUOTE_SINGLE" ? "'" : value.type === "QUOTE_DOUBLE" ? '"' : "";
  const text = `${quote}${timestamp}${quote}`;
  const start = block.offset + value.range[0];
  const end = block.offset + value.range[1];
  return contents.slice(start, end) === text ? {} : { edit: { start, end, text } };
}
