import * as vscode from "vscode";
import { getMarkdownGlob, TitleIndex } from "./titleIndex";
import { migrateTabLabelState, TabLabelManager } from "./tabLabels";
import { TitleTree } from "./titleTree";
import { registerModifiedOnSave } from "./modifiedOnSave";

import { newNoteCommand } from "./newNoteCommand";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await migrateTabLabelState(context.workspaceState);
  const output = vscode.window.createOutputChannel("GritPad");
  const index = new TitleIndex(output);
  const tree = new TitleTree(index);
  const tabLabels = new TabLabelManager(context.workspaceState, index, output);
  const treeView = vscode.window.createTreeView("gritPad", {
    treeDataProvider: tree,
    showCollapseAll: true,
  });

  context.subscriptions.push(output, index, tree, treeView, registerModifiedOnSave(output));
  context.subscriptions.push(
    index.onDidChange(() => {
      if (tabLabels.enabled) {
        void tabLabels.sync();
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("gritPad.newNote", async () => {
      const uri = await newNoteCommand(output);
      if (uri) {
        index.invalidate(uri);
        await index.refresh();
      }
    }),
    vscode.commands.registerCommand("gritPad.refresh", async () => {
      await index.refresh(true);
    }),
    vscode.commands.registerCommand(
      "gritPad.enableTabLabels",
      async () => {
        await tabLabels.enable();
      },
    ),
    vscode.commands.registerCommand(
      "gritPad.refreshTabLabels",
      async () => {
        await tabLabels.refresh();
      },
    ),
    vscode.commands.registerCommand(
      "gritPad.disableTabLabels",
      async () => {
        await tabLabels.disable();
      },
    ),
  );

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRefresh = (uris: vscode.Uri[] = []): void => {
    for (const uri of uris) {
      index.invalidate(uri);
    }
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void index.refresh().catch((error: unknown) => {
        output.appendLine(`Unable to refresh GritPad: ${String(error)}`);
      });
    }, 200);
  };
  const watcher = vscode.workspace.createFileSystemWatcher(getMarkdownGlob());
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate((uri) => scheduleRefresh([uri])),
    watcher.onDidChange((uri) => scheduleRefresh([uri])),
    watcher.onDidDelete((uri) => scheduleRefresh([uri])),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (/\.md$/i.test(document.uri.path)) {
        scheduleRefresh([document.uri]);
      }
    }),
    vscode.workspace.onDidRenameFiles((event) => {
      scheduleRefresh(
        event.files.flatMap((file) => [file.oldUri, file.newUri]),
      );
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      scheduleRefresh();
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      scheduleRefresh();
    }),
    new vscode.Disposable(() => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    }),
  );

  void index.refresh().then(() => {
    if (tabLabels.enabled) {
      return tabLabels.sync();
    }
    return undefined;
  }).catch((error: unknown) => {
    output.appendLine(`Unable to initialize GritPad: ${String(error)}`);
  });
}

export function deactivate(): void {}
