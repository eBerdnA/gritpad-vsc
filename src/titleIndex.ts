import * as path from "node:path";
import * as vscode from "vscode";
import { readFrontmatterTitle } from "./frontmatter";

export interface MarkdownTitleEntry {
  uri: vscode.Uri;
  filename: string;
  title: string;
  frontmatterTitle?: string;
  frontmatterError?: string;
}

const markdownGlob = "**/*.{md,Md,mD,MD}";
const readConcurrency = 8;

export class TitleIndex implements vscode.Disposable {
  private readonly entries = new Map<string, MarkdownTitleEntry>();
  private readonly dirtyUris = new Set<string>();
  private readonly changed = new vscode.EventEmitter<void>();
  private refreshTask?: Promise<void>;
  private refreshAgain = false;

  readonly onDidChange = this.changed.event;

  constructor(private readonly output: vscode.OutputChannel) {}

  getEntries(): MarkdownTitleEntry[] {
    return [...this.entries.values()];
  }

  invalidate(uri: vscode.Uri): void {
    this.dirtyUris.add(uri.toString());
  }

  invalidateAll(): void {
    for (const key of this.entries.keys()) {
      this.dirtyUris.add(key);
    }
  }

  async refresh(force = false): Promise<void> {
    if (force) {
      this.invalidateAll();
    }
    if (this.refreshTask) {
      this.refreshAgain = true;
      return this.refreshTask;
    }

    this.refreshTask = this.refreshLoop();
    try {
      await this.refreshTask;
    } finally {
      this.refreshTask = undefined;
    }
  }

  dispose(): void {
    this.changed.dispose();
  }

  private async refreshLoop(): Promise<void> {
    do {
      this.refreshAgain = false;
      await this.refreshOnce();
    } while (this.refreshAgain);
  }

  private async refreshOnce(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    if (workspaceFolders.length === 0) {
      this.entries.clear();
      this.dirtyUris.clear();
      this.changed.fire();
      return;
    }

    let files: vscode.Uri[];
    try {
      files = await vscode.workspace.findFiles(markdownGlob);
    } catch (error) {
      this.output.appendLine(`Unable to discover Markdown files: ${String(error)}`);
      return;
    }

    const fileKeys = new Set(files.map((uri) => uri.toString()));
    for (const key of this.entries.keys()) {
      if (!fileKeys.has(key)) {
        this.entries.delete(key);
        this.dirtyUris.delete(key);
      }
    }

    const filesToRead = files.filter(
      (uri) => !this.entries.has(uri.toString()) || this.dirtyUris.has(uri.toString()),
    );
    let nextFile = 0;
    const workerCount = Math.min(readConcurrency, filesToRead.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextFile < filesToRead.length) {
        const uri = filesToRead[nextFile++];
        await this.readEntry(uri);
      }
    });
    await Promise.all(workers);
    this.changed.fire();
  }

  private async readEntry(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    this.dirtyUris.delete(key);
    const filename = path.posix.basename(uri.path);
    try {
      const contents = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
      const result = readFrontmatterTitle(contents);
      if (result.error) {
        this.output.appendLine(`Invalid frontmatter in ${uri.fsPath}: ${result.error}`);
      }
      this.entries.set(key, {
        uri,
        filename,
        title: result.title ?? filename,
        frontmatterTitle: result.title,
        frontmatterError: result.error,
      });
    } catch (error) {
      this.output.appendLine(`Unable to read ${uri.fsPath}: ${String(error)}`);
      this.entries.set(key, { uri, filename, title: filename });
    }
  }
}

export function getMarkdownGlob(): string {
  return markdownGlob;
}
