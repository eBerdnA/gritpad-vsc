import * as vscode from "vscode";
import { buildNewNote } from "./newNote";

export async function createNoteFile(folder: vscode.Uri, title: string): Promise<vscode.Uri> {
  const { id, contents } = buildNewNote(title);
  const uri = vscode.Uri.joinPath(folder, `${id}.md`);
  const edit = new vscode.WorkspaceEdit();
  edit.createFile(uri, {
    overwrite: false,
    ignoreIfExists: false,
    contents: Buffer.from(contents, "utf8"),
  });
  if (!await vscode.workspace.applyEdit(edit)) {
    throw new Error(`Could not create note at ${uri.toString()}.`);
  }
  return uri;
}

export async function newNoteCommand(output: vscode.OutputChannel): Promise<vscode.Uri | undefined> {
  if (!vscode.workspace.isTrusted) {
    void vscode.window.showWarningMessage("Trust this workspace before creating a note.");
    return undefined;
  }
  const title = await vscode.window.showInputBox({
    title: "New Markdown Note",
    prompt: "Enter the note title. The filename will be a new UUID.",
    placeHolder: "a new note",
    ignoreFocusOut: true,
    validateInput: (value) => !value.trim() || /[\r\n]/.test(value.trim())
      ? "Enter a nonempty, single-line title."
      : undefined,
  });
  if (title === undefined) {
    return undefined;
  }
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  const defaultUri = activeUri && /\.md$/i.test(activeUri.path) && vscode.workspace.getWorkspaceFolder(activeUri)
    ? vscode.Uri.joinPath(activeUri, "..")
    : vscode.workspace.workspaceFolders?.[0]?.uri;
  const folders = await vscode.window.showOpenDialog({
    title: "Choose a Folder for the New Note",
    openLabel: "Create Note Here",
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri,
  });
  if (!folders?.[0]) {
    return undefined;
  }
  try {
    const uri = await createNoteFile(folders[0], title);
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
    return uri;
  } catch (error) {
    output.appendLine(`Unable to create new note: ${String(error)}`);
    void vscode.window.showErrorMessage(`Markdown Titles could not create the note: ${String(error)}`);
    return undefined;
  }
}
