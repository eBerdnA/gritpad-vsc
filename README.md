# GritPad

A Visual Studio Code extension that displays YAML frontmatter titles for Markdown files in a dedicated Explorer view. Editor-tab titles are available as an explicit, per-workspace opt-in.

## Explorer view

Open **Explorer → Gritpad**. The view keeps workspace folders and subfolders, and shows each Markdown file using its non-empty YAML string `title`. Files without a usable title use their original filename. Duplicate titles remain separate and show their relative paths.

Only a leading YAML block is read. The extension supports `.md` files (case-insensitive extension), parses the saved file on disk, and never renames or opens an alias for a document; title display does not rewrite files. Invalid YAML and unreadable files fall back to the filename; details are written to **View → Output → GritPad**. VS Code workspace exclusions are respected. Changes are refreshed after saves and file or workspace-folder changes; use **Gritpad: Refresh Explorer View** for a manual refresh.

This is a separate Explorer view, not a replacement for VS Code's built-in Files tree. Opening an entry opens its original URI in a normal text editor.

## Editor-tab titles (opt-in)

Run **Gritpad: Enable Editor Tab Titles** and confirm the workspace-settings warning. This adds exact-file entries to `workbench.editor.customLabels.patterns` at the workspace scope: `.vscode/settings.json` for a single-folder workspace or the `.code-workspace` file for a multi-root workspace. Those files may be tracked by version control. The extension does not write user-global settings and does not copy global label rules into workspace settings.

After enabling, saved title and file changes update the extension-owned rules. Run **Gritpad: Refresh Editor Tab Titles** to reconcile them manually. **Gritpad: Disable Editor Tab Titles** removes only rules still equal to the extension's last-written values. Existing rules are preserved; conflicting rules and extension-owned rules edited by a user are not overwritten or removed. Disable the feature before uninstalling; uninstall does not guarantee workspace-settings cleanup.

Tab-label rules are written only in trusted workspaces. VS Code's custom-label setting does not safely represent every title or path, so the extension leaves the normal tab label in place and logs a reason when:

- The title has no ASCII letter or digit (a VS Code custom-label requirement).
- The title contains a recognized template expression such as `${filename}` or `${dirname}`.
- The file path contains glob metacharacters, or another workspace file has the same exact pattern but a different title.

Unicode titles are supported when they include an ASCII letter or digit. The custom-label feature must also remain enabled in VS Code settings.

## Create a note

Run **Gritpad: New Note** from the Command Palette. Enter a title and choose the destination folder; the folder picker defaults to the current workspace note's folder, or the first workspace root. Cancel either prompt to leave files unchanged.

The command creates and saves `<new UUID>.md`, then opens it in a normal editor. Its leading YAML frontmatter contains the matching UUID `id`, your title, and identical `created` and `modified` timestamps in the computer's local time and UTC offset. Titles are safely YAML-escaped when needed. Existing files are never overwritten. Note creation requires a trusted workspace; it does not enable timestamp-on-save or change your notes allowlist.

## Update note modification timestamps on save (opt-in)

In **Workspace** or **Workspace Folder** settings, explicitly enable the feature and select your notes with folder-relative glob patterns:

```json
{
  "gritPad.modifiedOnSave.enabled": true,
  "gritPad.modifiedOnSave.include": ["notes/**/*.md"]
}
```

Replace `notes/**/*.md` with your actual notes location. Both settings are required: the feature defaults to off, and an empty allowlist matches nothing. User-global values are ignored. In multi-root workspaces, patterns are relative to each file's workspace folder; use folder settings to restrict the feature to one root.

Only dirty `.md` files inside a trusted workspace that match the allowlist and already contain a top-level YAML `modified` string are updated. The existing value is replaced during the original save, including Auto Save, without an extra save. Unchanged files, files outside the allowlist, missing properties, nested properties, and non-Markdown files are untouched. Opening a note or refreshing the view does not change timestamps.

The format is `modified: 2026-10-30 09:48:01 +0100`, using the computer's local wall time and current UTC offset, including daylight-saving changes. Existing single/double quotes, comments, line endings, and other content are preserved. Malformed YAML and unsupported values (including multiline, tagged, or anchored values) are left unchanged with a reason in **Output > GritPad**. Set `enabled` to `false` to stop updates.

## Install a local build

Build the extension package:

```sh
npm ci
npm run package
```

Install the generated VSIX with VS Code:

```sh
code --install-extension markdown-frontmatter-titles-0.4.0.vsix
```

## Development and tests

```sh
npm ci
npm test
```

The test command runs parser and path-rule unit tests, then launches an Extension Development Host for indexing, tree-opening, file-lifecycle, settings-preservation, real tab-label, and restart-persistence tests. If VS Code is installed locally, set `VSCODE_EXECUTABLE` to its executable to avoid downloading another copy; for example on macOS:

```sh
VSCODE_EXECUTABLE="/Applications/Visual Studio Code.app/Contents/MacOS/Code" npm test
```

## Upgrading from 0.3 and earlier

The extension is now displayed as **GritPad**, with an Explorer view named **Gritpad** and Command Palette entries prefixed **Gritpad:**. The installed extension ID (`local.markdown-frontmatter-titles`) remains unchanged so this is an in-place update rather than a second extension.

Rename the old `frontmatterTitles.modifiedOnSave.enabled` and `frontmatterTitles.modifiedOnSave.include` settings to `gritPad.modifiedOnSave.enabled` and `gritPad.modifiedOnSave.include` respectively. The old settings are no longer read; the extension does not edit your settings automatically. Existing tab-title opt-in and owned-rule records are migrated to the new internal keys so refresh and cleanup continue to work.
