import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { TitleIndex } from "../../titleIndex";
import { TabLabelManager } from "../../tabLabels";
import { TitleTree } from "../../titleTree";

suite("Markdown Frontmatter Titles Extension Host", () => {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder);
  assert.equal(vscode.workspace.isTrusted, true);

  const extension = vscode.extensions.getExtension("local.markdown-frontmatter-titles");
  assert.ok(extension);

  const output = vscode.window.createOutputChannel("Markdown Titles Test");
  const index = new TitleIndex(output);
  const tree = new TitleTree(index);

  setup(async () => {
    await extension.activate();
    await index.refresh(true);
  });

  suiteTeardown(() => {
    tree.dispose();
    index.dispose();
    output.dispose();
  });

  if (process.env.RELOAD_CHECK === "1") {
    test("restores persisted exact-file labels after an Extension Host restart", async () => {
      const articleUri = vscode.Uri.joinPath(workspaceFolder.uri, "docs", "article.md");
      await vscode.commands.executeCommand("vscode.open", articleUri);
      await waitForTabLabel("User-edited label");
    });
  } else {
  test("indexes only included Markdown files and preserves original URIs", async () => {
    const entries = index.getEntries();
    assert.equal(entries.length, 10);
    assert.equal(
      entries.find((entry) => entry.filename === "article.md")?.title,
      "Original Title",
    );
    assert.equal(
      entries.find((entry) => entry.filename === "fallback.MD")?.title,
      "fallback.MD",
    );
    assert.equal(
      entries.find((entry) => entry.filename === "malformed.md")?.title,
      "malformed.md",
    );
    assert.match(
      entries.find((entry) => entry.filename === "malformed.md")?.frontmatterError ?? "",
      /Flow sequence|Unexpected|Missing/i,
    );
    assert.equal(entries.find((entry) => entry.filename === "unicode.md")?.title, "Résumé 📚");
    assert.equal(entries.some((entry) => entry.filename === "hidden.md"), false);

    const article = entries.find((entry) => entry.filename === "article.md");
    assert.ok(article);
    assert.equal(
      article.uri.fsPath,
      path.join(workspaceFolder.uri.fsPath, "docs", "article.md"),
    );
  });

  test("builds a hierarchical tree with duplicate-title paths and opens the original file", async () => {
    const root = tree
      .getChildren()
      .find((node) => node.uri.toString() === workspaceFolder.uri.toString());
    assert.ok(root);

    const docs = tree.getChildren(root).find((node) => node.label === "docs");
    assert.ok(docs);
    const article = tree
      .getChildren(docs)
      .find((node) => node.entry?.filename === "article.md");
    const duplicate = tree
      .getChildren(docs)
      .find((node) => node.entry?.filename === "duplicate.md");
    assert.ok(article);
    assert.ok(duplicate);
    assert.equal(article.label, "Original Title");
    assert.equal(duplicate.label, "Original Title");

    const articleItem = tree.getTreeItem(article);
    const duplicateItem = tree.getTreeItem(duplicate);
    assert.notEqual(articleItem.id, duplicateItem.id);
    assert.equal(articleItem.description, "docs/article.md");
    assert.equal(duplicateItem.description, "docs/duplicate.md");
    assert.equal(articleItem.resourceUri?.toString(), article.entry?.uri.toString());

    const command = articleItem.command;
    assert.ok(typeof command === "object" && command !== null);
    await vscode.commands.executeCommand(command.command, ...(command.arguments ?? []));
    assert.equal(
      vscode.window.activeTextEditor?.document.uri.toString(),
      article.entry?.uri.toString(),
    );
  });

  test("reconciles saved changes, creation, deletion, and renames", async () => {
    const articleUri = vscode.Uri.joinPath(workspaceFolder.uri, "docs", "article.md");
    await vscode.workspace.fs.writeFile(
      articleUri,
      Buffer.from("---\ntitle: Updated Title\n---\nUpdated body\n"),
    );
    index.invalidate(articleUri);
    await index.refresh();
    assert.equal(
      index.getEntries().find((entry) => entry.uri.toString() === articleUri.toString())?.title,
      "Updated Title",
    );
    assert.equal(
      fs.readFileSync(articleUri.fsPath, "utf8"),
      "---\ntitle: Updated Title\n---\nUpdated body\n",
    );

    const createdUri = vscode.Uri.joinPath(workspaceFolder.uri, "docs", "created.md");
    await vscode.workspace.fs.writeFile(
      createdUri,
      Buffer.from("---\ntitle: Created\n---\n"),
    );
    await index.refresh(true);
    assert.equal(index.getEntries().some((entry) => entry.uri.toString() === createdUri.toString()), true);

    const renamedUri = vscode.Uri.joinPath(workspaceFolder.uri, "docs", "renamed.md");
    await vscode.workspace.fs.rename(createdUri, renamedUri);
    await index.refresh(true);
    assert.equal(index.getEntries().some((entry) => entry.uri.toString() === createdUri.toString()), false);
    assert.equal(index.getEntries().some((entry) => entry.uri.toString() === renamedUri.toString()), true);

    await vscode.workspace.fs.delete(renamedUri);
    await index.refresh(true);
    assert.equal(index.getEntries().some((entry) => entry.uri.toString() === renamedUri.toString()), false);
  });

  test("applies safe exact tab labels and removes only unchanged owned rules", async () => {
    const configuration = vscode.workspace.getConfiguration("workbench.editor.customLabels");
    const originalPatterns = configuration.get<Record<string, string>>("patterns", {});
    assert.equal(originalPatterns["**/*.md"], "Generic label");
    assert.equal(originalPatterns["global-only.md"], "Global label");

    const memento = new TestMemento();
    const manager = new TabLabelManager(memento, index, output);
    assert.equal(await manager.sync(), true);

    const articleUri = vscode.Uri.joinPath(workspaceFolder.uri, "docs", "article.md");
    const articlePattern = exactPattern(workspaceFolder.uri.path, articleUri.path);
    const conflictUri = vscode.Uri.joinPath(workspaceFolder.uri, "docs", "conflict.md");
    const conflictPattern = exactPattern(workspaceFolder.uri.path, conflictUri.path);
    const duplicateUri = vscode.Uri.joinPath(workspaceFolder.uri, "docs", "duplicate.md");
    const duplicatePattern = exactPattern(workspaceFolder.uri.path, duplicateUri.path);
    const patterns = vscode.workspace
      .getConfiguration("workbench.editor.customLabels")
      .get<Record<string, string>>("patterns", {});
    const workspacePatterns = vscode.workspace
      .getConfiguration("workbench.editor.customLabels")
      .inspect<Record<string, string>>("patterns")?.workspaceValue;
    assert.ok(workspacePatterns);
    assert.equal(patterns[articlePattern], "Updated Title");
    assert.equal(patterns["**/*.md"], "Generic label");
    assert.equal(patterns[conflictPattern], "User conflict");
    assert.equal(patterns[duplicatePattern], "Original Title");
    assert.equal(patterns["global-only.md"], "Global label");
    assert.equal(Object.hasOwn(workspacePatterns, "global-only.md"), false);
    const unicodeUri = vscode.Uri.joinPath(workspaceFolder.uri, "docs", "unicode.md");
    const unicodePattern = exactPattern(workspaceFolder.uri.path, unicodeUri.path);
    assert.equal(patterns[unicodePattern], "Résumé 📚");
    const templateUri = vscode.Uri.joinPath(workspaceFolder.uri, "docs", "template.md");
    const templatePattern = exactPattern(workspaceFolder.uri.path, templateUri.path);
    assert.equal(Object.hasOwn(patterns, templatePattern), false);
    const globPathUri = vscode.Uri.joinPath(workspaceFolder.uri, "docs", "post[1].md");
    const globPathPattern = exactPattern(workspaceFolder.uri.path, globPathUri.path);
    assert.equal(Object.hasOwn(patterns, globPathPattern), false);
    const unicodeOnlyUri = vscode.Uri.joinPath(workspaceFolder.uri, "docs", "unicode-only.md");
    const unicodeOnlyPattern = exactPattern(workspaceFolder.uri.path, unicodeOnlyUri.path);
    assert.equal(Object.hasOwn(patterns, unicodeOnlyPattern), false);

    await vscode.commands.executeCommand("vscode.open", articleUri);
    await waitForTabLabel("Updated Title");
    await vscode.commands.executeCommand("vscode.open", unicodeUri);
    await waitForTabLabel("Résumé 📚");

    await configuration.update(
      "patterns",
      { ...workspacePatterns, [articlePattern]: "User-edited label" },
      vscode.ConfigurationTarget.Workspace,
    );
    assert.equal(await manager.disable(), true);

    const cleanedPatterns = vscode.workspace
      .getConfiguration("workbench.editor.customLabels")
      .get<Record<string, string>>("patterns", {});
    assert.equal(cleanedPatterns[articlePattern], "User-edited label");
    assert.equal(Object.hasOwn(cleanedPatterns, duplicatePattern), false);
    assert.equal(cleanedPatterns[conflictPattern], "User conflict");
    assert.equal(cleanedPatterns["**/*.md"], "Generic label");
    assert.equal(Object.hasOwn(cleanedPatterns, unicodePattern), false);
    const cleanedInspection = vscode.workspace
      .getConfiguration("workbench.editor.customLabels")
      .inspect<Record<string, string>>("patterns");
    assert.equal(cleanedInspection?.globalValue?.["global-only.md"], "Global label");
    assert.equal(
      Object.hasOwn(cleanedInspection?.workspaceValue ?? {}, "global-only.md"),
      false,
    );
  });

  test("includes both workspace roots in the tree and index", async () => {
    await index.refresh(true);

    assert.equal(index.getEntries().some((entry) => entry.filename === "second.md"), true);
    const roots = tree.getChildren();
    assert.deepEqual(roots.map((root) => root.label).sort(), [workspaceFolder.name, "Second Root"].sort());
  });
  }
});

class TestMemento implements vscode.Memento {
  private readonly values = new Map<string, unknown>();

  keys(): readonly string[] {
    return [...this.values.keys()];
  }

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    const value = this.values.get(key);
    return value === undefined ? defaultValue : value as T;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.values.delete(key);
    } else {
      this.values.set(key, value);
    }
  }
}

function exactPattern(workspacePath: string, filePath: string): string {
  return path.posix.relative(path.posix.dirname(workspacePath), filePath);
}

async function waitForTabLabel(expected: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const activeTab = vscode.window.tabGroups.activeTabGroup.tabs.find((tab) => tab.isActive);
    if (activeTab?.label === expected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(
    vscode.window.tabGroups.activeTabGroup.tabs.find((tab) => tab.isActive)?.label,
    expected,
  );
}
