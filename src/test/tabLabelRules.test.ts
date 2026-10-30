import assert from "node:assert/strict";
import test from "node:test";
import { createTabLabelRules } from "../tabLabelRules";

test("creates exact relative patterns that include the workspace folder name", () => {
  const result = createTabLabelRules([
    {
      path: "/projects/demo/docs/overview.md",
      uriPath: "/projects/demo/docs/overview.md",
      workspaceFolderPath: "/projects/demo",
      title: "Project overview",
    },
  ]);
  assert.deepEqual([...result.rules], [["demo/docs/overview.md", "Project overview"]]);
  assert.deepEqual(result.skipped, []);
});

test("uses slash-normalized URI paths for Windows workspaces", () => {
  const result = createTabLabelRules([
    {
      path: "C:\\Projects\\demo\\docs\\overview.md",
      uriPath: "/C:/Projects/demo/docs/overview.md",
      workspaceFolderPath: "/C:/Projects/demo",
      title: "Project overview",
    },
  ]);
  assert.deepEqual([...result.rules], [["demo/docs/overview.md", "Project overview"]]);
});

test("keeps Unicode titles when VS Code can represent them", () => {
  const result = createTabLabelRules([
    {
      path: "/work/naïve/über.md",
      uriPath: "/work/naïve/über.md",
      workspaceFolderPath: "/work",
      title: "Résumé 📚",
    },
  ]);
  assert.deepEqual([...result.rules], [["work/naïve/über.md", "Résumé 📚"]]);
  assert.deepEqual(result.skipped, []);
});

test("retains normal labels when a title is Unicode-only or template syntax", () => {
  const result = createTabLabelRules([
    {
      path: "/work/emoji.md",
      uriPath: "/work/emoji.md",
      workspaceFolderPath: "/work",
      title: "📚",
    },
    {
      path: "/work/template.md",
      uriPath: "/work/template.md",
      workspaceFolderPath: "/work",
      title: "${filename}",
    },
  ]);
  assert.equal(result.rules.size, 0);
  assert.match(result.skipped[0].reason, /ASCII letter or digit/);
  assert.match(result.skipped[1].reason, /template/);
});

test("retains normal labels for control characters", () => {
  const result = createTabLabelRules([
    {
      path: "/work/newline.md",
      uriPath: "/work/newline.md",
      workspaceFolderPath: "/work",
      title: "Line one\nLine two",
    },
  ]);
  assert.equal(result.rules.size, 0);
  assert.match(result.skipped[0].reason, /control characters/);
});

test("does not create rules for Markdown files without a frontmatter title", () => {
  const result = createTabLabelRules([
    {
      path: "/work/readme.md",
      uriPath: "/work/readme.md",
      workspaceFolderPath: "/work",
    },
  ]);
  assert.equal(result.rules.size, 0);
});

test("does not create a rule when another matching Markdown file has no frontmatter title", () => {
  const result = createTabLabelRules([
    {
      path: "/a/notes/page.md",
      uriPath: "/a/notes/page.md",
      workspaceFolderPath: "/a/notes",
      title: "Page",
    },
    {
      path: "/b/notes/page.md",
      uriPath: "/b/notes/page.md",
      workspaceFolderPath: "/b/notes",
    },
  ]);
  assert.equal(result.rules.size, 0);
});

test("does not create a rule when another matching Markdown file has an unsupported title", () => {
  const result = createTabLabelRules([
    {
      path: "/a/notes/page.md",
      uriPath: "/a/notes/page.md",
      workspaceFolderPath: "/a/notes",
      title: "Page",
    },
    {
      path: "/b/notes/page.md",
      uriPath: "/b/notes/page.md",
      workspaceFolderPath: "/b/notes",
      title: "📚",
    },
  ]);
  assert.equal(result.rules.size, 0);
  assert.match(result.skipped[0].reason, /ASCII letter or digit/);
  assert.match(result.skipped[1].reason, /cannot be safely labeled/);
});

test("rejects glob metacharacters in file paths", () => {
  const result = createTabLabelRules([
    {
      path: "/work/docs/post[1].md",
      uriPath: "/work/docs/post[1].md",
      workspaceFolderPath: "/work",
      title: "Post one",
    },
  ]);
  assert.equal(result.rules.size, 0);
  assert.match(result.skipped[0].reason, /safe exact/);
});

test("skips conflicting paths across roots but keeps identical-title rules", () => {
  const conflict = createTabLabelRules([
    {
      path: "/projects/one/docs/page.md",
      uriPath: "/projects/one/docs/page.md",
      workspaceFolderPath: "/projects/one",
      title: "First",
    },
    {
      path: "/archive/one/docs/page.md",
      uriPath: "/archive/one/docs/page.md",
      workspaceFolderPath: "/archive/one",
      title: "Second",
    },
  ]);
  assert.equal(conflict.rules.size, 0);
  assert.equal(conflict.skipped.length, 2);

  const identical = createTabLabelRules([
    {
      path: "/projects/one/docs/page.md",
      uriPath: "/projects/one/docs/page.md",
      workspaceFolderPath: "/projects/one",
      title: "Page",
    },
    {
      path: "/archive/one/docs/page.md",
      uriPath: "/archive/one/docs/page.md",
      workspaceFolderPath: "/archive/one",
      title: "Page",
    },
  ]);
  assert.deepEqual([...identical.rules], [["one/docs/page.md", "Page"]]);
});

test("rejects case-insensitive path collisions with different titles", () => {
  const result = createTabLabelRules([
    {
      path: "/work/Docs/page.md",
      uriPath: "/work/Docs/page.md",
      workspaceFolderPath: "/work",
      title: "Uppercase path",
    },
    {
      path: "/work/docs/page.md",
      uriPath: "/work/docs/page.md",
      workspaceFolderPath: "/work",
      title: "Lowercase path",
    },
  ]);
  assert.equal(result.rules.size, 0);
  assert.equal(result.skipped.length, 2);
});
