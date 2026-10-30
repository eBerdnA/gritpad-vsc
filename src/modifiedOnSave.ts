import * as vscode from "vscode";
import { getModifiedEdit } from "./modified";

function workspaceSetting<T>(configuration: vscode.WorkspaceConfiguration, key: string, fallback: T): T {
  const setting = configuration.inspect<T>(key);
  return setting?.workspaceFolderValue ?? setting?.workspaceValue ?? fallback;
}

export function registerModifiedOnSave(output: vscode.OutputChannel): vscode.Disposable {
  return vscode.workspace.onWillSaveTextDocument((event) => {
    const document = event.document;
    if (!vscode.workspace.isTrusted || !document.isDirty || !/\.md$/i.test(document.uri.path)) {
      return;
    }
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
      return;
    }
    const configuration = vscode.workspace.getConfiguration("frontmatterTitles.modifiedOnSave", document.uri);
    const enabled = workspaceSetting<unknown>(configuration, "enabled", false);
    const include = workspaceSetting<unknown>(configuration, "include", []);
    if (enabled !== true) {
      return;
    }
    if (!Array.isArray(include) || !include.every((pattern) => typeof pattern === "string" && pattern.trim().length > 0)) {
      output.appendLine(`Skipped modified timestamp for ${document.uri.toString()}: include must be an array of nonempty glob patterns.`);
      return;
    }
    const matches = include.some((pattern: string) => vscode.languages.match({
      pattern: new vscode.RelativePattern(folder, pattern),
    }, document) > 0);
    if (!matches) {
      return;
    }
    const result = getModifiedEdit(document.getText(), new Date());
    if (result.error) {
      output.appendLine(`Skipped modified timestamp for ${document.uri.toString()}: ${result.error}`);
      return;
    }
    if (result.edit) {
      const { start, end, text } = result.edit;
      event.waitUntil(Promise.resolve([
        vscode.TextEdit.replace(new vscode.Range(document.positionAt(start), document.positionAt(end)), text),
      ]));
    }
  });
}
