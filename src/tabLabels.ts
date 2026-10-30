import * as vscode from "vscode";
import { TitleIndex } from "./titleIndex";
import { createTabLabelRules } from "./tabLabelRules";

const enabledStateKey = "gritPad.tabLabelsEnabled";
const ownedRulesStateKey = "gritPad.ownedTabRules";

export async function migrateTabLabelState(state: vscode.Memento): Promise<void> {
  // Retain ownership across the rebrand so cleanup never loses existing rules.
  for (const [legacy, current] of [
    ["frontmatterTitles.tabLabelsEnabled", enabledStateKey],
    ["frontmatterTitles.ownedTabRules", ownedRulesStateKey],
  ]) {
    const oldValue = state.get<unknown>(legacy);
    if (oldValue === undefined) {
      continue;
    }
    if (state.get<unknown>(current) === undefined) {
      await state.update(current, oldValue);
    }
    await state.update(legacy, undefined);
  }
}

type OwnedRules = Record<string, string>;

export class TabLabelManager {
  private syncQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly workspaceState: vscode.Memento,
    private readonly index: TitleIndex,
    private readonly output: vscode.OutputChannel,
  ) {}

  get enabled(): boolean {
    return this.workspaceState.get<boolean>(enabledStateKey, false);
  }

  async enable(): Promise<boolean> {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        "GritPad will not change workspace settings in an untrusted workspace.",
      );
      return false;
    }
    if (!vscode.workspace.workspaceFolders?.length) {
      void vscode.window.showWarningMessage(
        "Open a workspace folder before enabling editor tab titles.",
      );
      return false;
    }

    const choice = await vscode.window.showWarningMessage(
      "Enable Markdown tab titles? This writes exact-file rules to this workspace's settings (a .vscode/settings.json file or a .code-workspace file). The settings may be tracked by version control. The extension will preserve unrelated rules and only remove rules it still owns.",
      { modal: true },
      "Enable",
    );
    if (choice !== "Enable") {
      return false;
    }

    await this.index.refresh(true);
    const succeeded = await this.sync();
    if (!succeeded) {
      void vscode.window.showWarningMessage(
        "GritPad could not enable editor tab titles. See the GritPad output for details.",
      );
      return false;
    }
    try {
      await this.workspaceState.update(enabledStateKey, true);
    } catch (error) {
      this.output.appendLine(`Unable to persist the tab-title opt-in: ${String(error)}`);
      await this.sync(true);
      void vscode.window.showWarningMessage(
        "GritPad could not save the tab-title opt-in and cleaned up its workspace rules.",
      );
      return false;
    }
    void vscode.window.showInformationMessage(
      "Markdown editor tab titles are enabled for this workspace.",
    );
    return true;
  }

  async refresh(): Promise<boolean> {
    if (!this.enabled) {
      void vscode.window.showWarningMessage(
        "Enable editor tab titles before refreshing their workspace rules.",
      );
      return false;
    }
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        "GritPad cannot update tab rules in an untrusted workspace.",
      );
      return false;
    }
    await this.index.refresh(true);
    const succeeded = await this.sync();
    if (!succeeded) {
      void vscode.window.showWarningMessage(
        "GritPad could not refresh editor tab titles. See the GritPad output for details.",
      );
    }
    return succeeded;
  }

  async disable(): Promise<boolean> {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        "GritPad cannot clean up workspace settings in an untrusted workspace.",
      );
      return false;
    }

    return this.enqueueSync(async () => {
      const wasEnabled = this.enabled;
      try {
        await this.workspaceState.update(enabledStateKey, false);
      } catch (error) {
        this.output.appendLine(`Unable to persist the tab-label opt-out: ${String(error)}`);
        void vscode.window.showWarningMessage(
          "GritPad could not save the tab-label opt-out. The tab-title setting is unchanged.",
        );
        return false;
      }

      let succeeded = false;
      try {
        succeeded = await this.syncOnce(true);
      } catch (error) {
        this.output.appendLine(`Unable to synchronize workspace tab-label settings: ${String(error)}`);
      }
      if (!succeeded) {
        try {
          await this.workspaceState.update(enabledStateKey, wasEnabled);
        } catch (error) {
          this.output.appendLine(`Unable to restore the tab-label opt-in state: ${String(error)}`);
        }
        void vscode.window.showWarningMessage(
          "GritPad could not clean up editor tab titles. See the GritPad output for details.",
        );
        return false;
      }
      void vscode.window.showInformationMessage(
        "Markdown editor tab titles are disabled for this workspace.",
      );
      return true;
    });
  }

  async sync(removeAllOwned = false): Promise<boolean> {
    return this.enqueueSync(() => this.syncOnce(removeAllOwned));
  }

  async syncIfEnabled(): Promise<boolean> {
    return this.enqueueSync(() => this.enabled ? this.syncOnce(false) : Promise.resolve(true));
  }

  private enqueueSync(task: () => Promise<boolean>): Promise<boolean> {
    const queuedTask = this.syncQueue.then(task).catch((error: unknown) => {
      this.output.appendLine(`Unable to synchronize workspace tab-label settings: ${String(error)}`);
      return false;
    });
    this.syncQueue = queuedTask.then(() => undefined);
    return queuedTask;
  }

  private async syncOnce(removeAllOwned: boolean): Promise<boolean> {
    if (!vscode.workspace.isTrusted) {
      this.output.appendLine("Skipped tab-label settings update: workspace is untrusted.");
      return false;
    }

    const previousOwned = { ...this.workspaceState.get<OwnedRules>(ownedRulesStateKey, {}) };
    for (let attempt = 1; attempt <= maxSyncAttempts; attempt += 1) {
      const plan = this.planSync(removeAllOwned, previousOwned);
      if (!plan) {
        return false;
      }

      try {
        await this.workspaceState.update(ownedRulesStateKey, plan.owned);
      } catch (error) {
        this.output.appendLine(`Unable to save owned tab-label rules: ${String(error)}`);
        void vscode.window.showWarningMessage(
          "GritPad could not save ownership for its tab-label rules. See the GritPad output for details.",
        );
        return false;
      }

      // Settings may have changed while ownership was being persisted. Writing the planned
      // object now would revert those edits, so plan again from the current settings.
      const configuration = vscode.workspace.getConfiguration("workbench.editor.customLabels");
      if (settingsSnapshot(configuration) !== plan.snapshot) {
        this.output.appendLine(
          "Tab-label settings changed during synchronization; recalculating rules.",
        );
        continue;
      }
      if (!plan.patternsChanged) {
        return true;
      }

      try {
        await configuration.update(
          "patterns",
          Object.keys(plan.nextPatterns).length > 0 ? plan.nextPatterns : undefined,
          vscode.ConfigurationTarget.Workspace,
        );
        return true;
      } catch (error) {
        this.output.appendLine(`Unable to update workspace tab-label settings: ${String(error)}`);
        await this.restoreOwnership(previousOwned);
        return false;
      }
    }

    this.output.appendLine(
      "Tab-label settings kept changing during synchronization; no settings were written.",
    );
    await this.restoreOwnership(previousOwned);
    return false;
  }

  private async restoreOwnership(previousOwned: OwnedRules): Promise<void> {
    try {
      await this.workspaceState.update(ownedRulesStateKey, previousOwned);
    } catch (error) {
      this.output.appendLine(`Unable to restore tab-label ownership: ${String(error)}`);
    }
  }

  private planSync(removeAllOwned: boolean, previousOwned: OwnedRules): SyncPlan | undefined {
    const configuration = vscode.workspace.getConfiguration("workbench.editor.customLabels");
    if (!removeAllOwned && !configuration.get<boolean>("enabled", true)) {
      this.output.appendLine(
        "Tab labels were not updated because workbench.editor.customLabels.enabled is false.",
      );
      return undefined;
    }

    const patterns = configuration.get<unknown>("patterns", {});
    const workspacePatternsValue = configuration.inspect<unknown>("patterns")?.workspaceValue;
    if (
      !patterns ||
      typeof patterns !== "object" ||
      Array.isArray(patterns) ||
      (workspacePatternsValue !== undefined &&
        (!workspacePatternsValue ||
          typeof workspacePatternsValue !== "object" ||
          Array.isArray(workspacePatternsValue)))
    ) {
      this.output.appendLine(
        "Tab labels were not updated because workbench.editor.customLabels.patterns is not an object.",
      );
      return undefined;
    }

    const effectivePatterns = patterns as Record<string, unknown>;
    const currentWorkspacePatterns = (workspacePatternsValue ?? {}) as Record<string, unknown>;
    const owned = { ...previousOwned };
    const candidates = this.index.getEntries().map((entry) => {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(entry.uri);
      return {
        path: entry.uri.fsPath,
        uriPath: entry.uri.path,
        workspaceFolderPath: workspaceFolder?.uri.path,
        title: entry.frontmatterTitle,
      };
    });
    const ruleSet = removeAllOwned ? undefined : createTabLabelRules(candidates);
    const desired = ruleSet?.rules ?? new Map<string, string>();
    for (const [pattern] of desired) {
      const variant = Object.keys(effectivePatterns).find(
        (existingPattern) =>
          existingPattern !== pattern &&
          existingPattern.toLowerCase() === pattern.toLowerCase(),
      );
      if (!variant) {
        continue;
      }

      const ownedVariantIsUnchanged =
        currentWorkspacePatterns[variant] !== undefined &&
        owned[variant] === currentWorkspacePatterns[variant];
      if (!ownedVariantIsUnchanged) {
        this.output.appendLine(
          `Preserved case-insensitive user tab-label rule "${variant}".`,
        );
        desired.delete(pattern);
      }
    }

    if (!removeAllOwned) {
      for (const skipped of ruleSet?.skipped ?? []) {
        this.output.appendLine(
          `Normal tab label retained for ${skipped.path}: ${skipped.reason}`,
        );
      }
    }

    const nextPatterns: Record<string, unknown> = { ...currentWorkspacePatterns };
    for (const [pattern, ownedValue] of Object.entries(owned)) {
      if (desired.has(pattern)) {
        continue;
      }
      if (currentWorkspacePatterns[pattern] === ownedValue) {
        delete nextPatterns[pattern];
      } else {
        this.output.appendLine(
          `Preserved user-edited tab-label rule "${pattern}" while cleaning up.`,
        );
      }
      delete owned[pattern];
    }

    for (const [pattern, title] of desired) {
      const currentWorkspaceValue = currentWorkspacePatterns[pattern];
      if (Object.hasOwn(owned, pattern)) {
        if (currentWorkspaceValue !== owned[pattern]) {
          this.output.appendLine(
            `Preserved user-edited tab-label rule "${pattern}" instead of replacing it.`,
          );
          delete owned[pattern];
          continue;
        }
        if (currentWorkspaceValue !== title) {
          nextPatterns[pattern] = title;
          owned[pattern] = title;
        }
      } else if (effectivePatterns[pattern] === undefined) {
        nextPatterns[pattern] = title;
        owned[pattern] = title;
      } else if (effectivePatterns[pattern] !== title) {
        this.output.appendLine(
          `Preserved conflicting tab-label rule "${pattern}".`,
        );
      }
    }

    return {
      snapshot: settingsSnapshot(configuration),
      owned,
      nextPatterns,
      patternsChanged: !sameRecord(currentWorkspacePatterns, nextPatterns),
    };
  }
}

interface SyncPlan {
  snapshot: string;
  owned: OwnedRules;
  nextPatterns: Record<string, unknown>;
  patternsChanged: boolean;
}

const maxSyncAttempts = 3;

function settingsSnapshot(configuration: vscode.WorkspaceConfiguration): string {
  return JSON.stringify([
    configuration.get<unknown>("enabled", true),
    configuration.get<unknown>("patterns", {}),
    configuration.inspect<unknown>("patterns")?.workspaceValue ?? null,
  ]);
}

function sameRecord(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && left[key] === right[key])
  );
}
