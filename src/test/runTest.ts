import { runTests } from "@vscode/test-electron";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

async function main(): Promise<void> {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "markdown-titles-test-"));
  const testWorkingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "vtt-"));
  const originalWorkingDirectory = process.cwd();
  const workspaceRoot = path.join(fixtureRoot, "primary");
  const secondRoot = path.join(fixtureRoot, "second-root");
  const userSettingsDirectory = path.join(testWorkingDirectory, "user-data", "User");
  fs.mkdirSync(path.join(workspaceRoot, "docs"), { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, "excluded"), { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, ".vscode"), { recursive: true });
  fs.mkdirSync(secondRoot, { recursive: true });
  fs.mkdirSync(userSettingsDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(userSettingsDirectory, "settings.json"),
    JSON.stringify({
      "workbench.editor.customLabels.patterns": {
        "global-only.md": "Global label",
      },
    }),
  );

  fs.writeFileSync(
    path.join(workspaceRoot, ".vscode", "settings.json"),
    JSON.stringify({ "files.exclude": { "excluded/**": true } }),
  );
  fs.writeFileSync(
    path.join(workspaceRoot, "docs", "article.md"),
    "---\ntitle: Original Title\n---\nOriginal body\n",
  );
  fs.writeFileSync(
    path.join(workspaceRoot, "docs", "duplicate.md"),
    "---\ntitle: Original Title\n---\nDuplicate body\n",
  );
  fs.writeFileSync(
    path.join(workspaceRoot, "docs", "conflict.md"),
    "---\ntitle: Conflict Title\n---\nConflict body\n",
  );
  fs.writeFileSync(
    path.join(workspaceRoot, "docs", "unicode.md"),
    "---\ntitle: 'Résumé 📚'\n---\nUnicode title\n",
  );
  fs.writeFileSync(
    path.join(workspaceRoot, "docs", "unicode-only.md"),
    "---\ntitle: '📚'\n---\nUnicode-only title\n",
  );
  fs.writeFileSync(
    path.join(workspaceRoot, "docs", "template.md"),
    "---\ntitle: '${filename}'\n---\nTemplate syntax\n",
  );
  fs.writeFileSync(
    path.join(workspaceRoot, "docs", "post[1].md"),
    "---\ntitle: Glob path\n---\nGlob syntax in path\n",
  );
  fs.writeFileSync(
    path.join(workspaceRoot, "docs", "malformed.md"),
    "---\ntitle: [\n---\nMalformed YAML\n",
  );
  fs.writeFileSync(path.join(workspaceRoot, "docs", "fallback.MD"), "Plain body\n");
  fs.writeFileSync(
    path.join(workspaceRoot, "excluded", "hidden.md"),
    "---\ntitle: Hidden\n---\n",
  );
  fs.writeFileSync(
    path.join(secondRoot, "second.md"),
    "---\ntitle: Second Root\n---\n",
  );
  const workspaceFile = path.join(fixtureRoot, "fixture.code-workspace");
  fs.writeFileSync(
    workspaceFile,
    JSON.stringify({
      folders: [{ path: "primary" }, { path: "second-root", name: "Second Root" }],
      settings: {
        "workbench.editor.customLabels.patterns": {
          "**/*.md": "Generic label",
          "primary/docs/conflict.md": "User conflict",
        },
      },
    }),
  );

  try {
    process.chdir(testWorkingDirectory);
    const testOptions = {
      vscodeExecutablePath: process.env.VSCODE_EXECUTABLE,
      extensionDevelopmentPath: path.resolve(__dirname, "../.."),
      extensionTestsPath: path.resolve(__dirname, "suite", "index"),
      launchArgs: [
        workspaceFile,
        "--disable-workspace-trust",
        `--user-data-dir=${path.join(testWorkingDirectory, "user-data")}`,
        `--extensions-dir=${path.join(testWorkingDirectory, "extensions")}`,
      ],
    };
    await runTests(testOptions);
    await runTests({
      ...testOptions,
      extensionTestsEnv: { RELOAD_CHECK: "1" },
    });
  } finally {
    process.chdir(originalWorkingDirectory);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(testWorkingDirectory, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
