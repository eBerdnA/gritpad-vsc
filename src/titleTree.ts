import * as path from "node:path";
import * as vscode from "vscode";
import { MarkdownTitleEntry, TitleIndex } from "./titleIndex";

interface TreeNode {
  id: string;
  label: string;
  uri: vscode.Uri;
  children: TreeNode[];
  isFolder: boolean;
  description?: string;
  tooltip?: string;
  entry?: MarkdownTitleEntry;
}

export class TitleTree implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<TreeNode | undefined | void>();
  private readonly indexSubscription: vscode.Disposable;

  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly index: TitleIndex) {
    this.indexSubscription = index.onDidChange(() => this.changed.fire());
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      node.label,
      node.isFolder
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    item.id = node.id;
    item.resourceUri = node.uri;
    item.description = node.description;
    item.tooltip = node.tooltip;

    if (!node.isFolder && node.entry) {
      item.command = {
        command: "vscode.open",
        title: "Open Markdown File",
        arguments: [node.entry.uri],
      };
      item.contextValue = "frontmatterMarkdown";
    } else {
      item.contextValue = "frontmatterFolder";
    }
    return item;
  }

  getChildren(node?: TreeNode): TreeNode[] {
    if (node) {
      return node.children;
    }
    return this.buildRoots();
  }

  dispose(): void {
    this.indexSubscription.dispose();
    this.changed.dispose();
  }

  private buildRoots(): TreeNode[] {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const entries = this.index.getEntries();
    const titleCounts = new Map<string, number>();
    for (const entry of entries) {
      titleCounts.set(entry.title, (titleCounts.get(entry.title) ?? 0) + 1);
    }

    const roots: TreeNode[] = folders.map((folder) => ({
      id: `folder:${folder.uri.toString()}`,
      label: folder.name,
      uri: folder.uri,
      children: [] as TreeNode[],
      isFolder: true,
      tooltip: folder.uri.fsPath,
    }));
    const rootByUri = new Map(roots.map((root) => [root.uri.toString(), root]));

    for (const entry of entries) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(entry.uri);
      if (!workspaceFolder) {
        continue;
      }
      const root = rootByUri.get(workspaceFolder.uri.toString());
      if (!root) {
        continue;
      }

      const relativePath = path.posix.relative(workspaceFolder.uri.path, entry.uri.path);
      if (!relativePath || relativePath.startsWith("../") || path.posix.isAbsolute(relativePath)) {
        continue;
      }
      const segments = relativePath.split("/");
      let parent = root;
      let parentUri = workspaceFolder.uri;
      for (const segment of segments.slice(0, -1)) {
        let folderNode = parent.children.find(
          (child) => child.isFolder && child.label === segment,
        );
        if (!folderNode) {
          const uri = vscode.Uri.joinPath(parentUri, segment);
          folderNode = {
            id: `folder:${uri.toString()}`,
            label: segment,
            uri,
            children: [],
            isFolder: true,
            tooltip: uri.fsPath,
          };
          parent.children.push(folderNode);
        }
        parent = folderNode;
        parentUri = folderNode.uri;
      }

      const duplicateTitle = (titleCounts.get(entry.title) ?? 0) > 1;
      parent.children.push({
        id: `file:${entry.uri.toString()}`,
        label: entry.title,
        uri: entry.uri,
        children: [],
        isFolder: false,
        description: duplicateTitle ? relativePath : undefined,
        tooltip: `${entry.uri.fsPath}\n${entry.filename}`,
        entry,
      });
    }

    const sortChildren = (nodes: TreeNode[]): void => {
      nodes.sort((left, right) => {
        if (left.isFolder !== right.isFolder) {
          return left.isFolder ? -1 : 1;
        }
        return left.label.localeCompare(right.label);
      });
      for (const child of nodes) {
        sortChildren(child.children);
      }
    };
    sortChildren(roots);
    return roots;
  }
}
