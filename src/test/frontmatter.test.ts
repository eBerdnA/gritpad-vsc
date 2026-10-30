import assert from "node:assert/strict";
import test from "node:test";
import { readFrontmatterTitle } from "../frontmatter";

test("reads and trims a string title from leading YAML frontmatter", () => {
  assert.deepEqual(
    readFrontmatterTitle("---\ntitle: '  A title  '\n---\nBody"),
    { title: "A title" },
  );
});

test("accepts CRLF and a UTF-8 byte-order mark", () => {
  assert.deepEqual(
    readFrontmatterTitle("\uFEFF---\r\ntitle: Notes\r\n---\r\nBody"),
    { title: "Notes" },
  );
});

test("ignores frontmatter-looking text that is not at the start", () => {
  assert.deepEqual(
    readFrontmatterTitle("Body\n---\ntitle: Not frontmatter\n---"),
    {},
  );
});

test("ignores absent, blank, and non-string titles", () => {
  assert.deepEqual(readFrontmatterTitle("---\nauthor: Ada\n---"), {});
  assert.deepEqual(readFrontmatterTitle("---\ntitle: '  '\n---"), {});
  assert.deepEqual(readFrontmatterTitle("---\ntitle: 42\n---"), {});
  assert.deepEqual(readFrontmatterTitle("---\ntitle: [one, two]\n---"), {});
});

test("reports invalid YAML and an unterminated frontmatter block", () => {
  assert.match(
    readFrontmatterTitle("---\ntitle: [\n---").error ?? "",
    /Flow sequence|Unexpected|Missing/i,
  );
  assert.match(
    readFrontmatterTitle("---\ntitle: Open").error ?? "",
    /closing --- delimiter/,
  );
});

test("reports duplicate YAML keys as malformed", () => {
  assert.match(
    readFrontmatterTitle("---\ntitle: First\ntitle: Second\n---").error ?? "",
    /Map keys must be unique/,
  );
});
