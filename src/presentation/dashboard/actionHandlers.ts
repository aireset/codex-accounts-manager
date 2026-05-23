import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { refreshSingleQuota } from "../../application/accounts/quota";
import { getDashboardCopy } from "../../application/dashboard/copy";
import type {
  DashboardActionName,
  DashboardActionPayload,
  DashboardBatchResultFailure,
  DashboardClientMessage,
  DashboardHostMessage
} from "../../domain/dashboard/types";
import type { CodexAccountRecord } from "../../core/types";
import type { SharedCodexAccountJson } from "../../core/types";
import type { DashboardLanguage } from "../../localization/languages";
import { AccountsRepository } from "../../storage";
import { AnnouncementService, type AnnouncementOptions } from "../../services/announcements";
import { runWithConcurrencyLimit } from "../../utils/concurrency";
import { getCommandCopy, t } from "../../utils";
import { clearAutoSwitchLock, setAutoSwitchLock } from "../workbench/autoSwitchState";
import { promptForTags } from "../tagEditor";
import { parseSharedJsonInput, toFailureMessage, toImportActionPayload } from "./actionUtils";
import type { DashboardOAuthCoordinator } from "./oauthCoordinator";

export type DashboardActionContext = {
  context: vscode.ExtensionContext;
  repo: AccountsRepository;
  resolveLanguage: () => DashboardLanguage;
  schedulePublishState: () => void;
  reloadShell: () => void;
  oauth: DashboardOAuthCoordinator;
  announcements: AnnouncementService;
  getAnnouncementOptions: () => AnnouncementOptions;
};

const CODEX_BATCH_REFRESH_CONCURRENCY = 1;
const CODEX_BATCH_REFRESH_DELAY_MS = 300;
const CODEX_SHARED_SYNC_FILENAME = "codex-accounts-sync.json";

export async function executeDashboardActionMessage(
  ctx: DashboardActionContext,
  message: Extract<DashboardClientMessage, { type: "dashboard:action" }>
): Promise<{
  status: Extract<DashboardHostMessage, { type: "dashboard:action-result" }>["status"];
  payload?: Extract<DashboardHostMessage, { type: "dashboard:action-result" }>["payload"];
  errorMessage?: string;
}> {
  let status: Extract<DashboardHostMessage, { type: "dashboard:action-result" }>["status"] = "completed";
  let payload: Extract<DashboardHostMessage, { type: "dashboard:action-result" }>["payload"];
  let errorMessage: string | undefined;

  try {
    const account = message.accountId ? await ctx.repo.getAccount(message.accountId) : undefined;
    payload = await runDashboardAction(ctx, message.action, message.payload, account);
  } catch (error) {
    status = "failed";
    errorMessage = toFailureMessage(error);
    console.error(`[codexAccounts] dashboard action failed: ${message.action}`, error);
  }

  return {
    status,
    payload,
    errorMessage
  };
}

async function runDashboardAction(
  ctx: DashboardActionContext,
  action: DashboardActionName,
  payload: DashboardActionPayload | undefined,
  account?: Awaited<ReturnType<AccountsRepository["getAccount"]>>
): Promise<Extract<DashboardHostMessage, { type: "dashboard:action-result" }>["payload"] | undefined> {
  const translate = t(ctx.resolveLanguage());

  switch (action) {
    case "addAccount":
      await vscode.commands.executeCommand("codexAccounts.addAccount");
      return undefined;
    case "importCurrent":
      await vscode.commands.executeCommand("codexAccounts.importCurrentAuth");
      return undefined;
    case "refreshAll":
      await vscode.commands.executeCommand("codexAccounts.refreshAllQuotas");
      return undefined;
    case "syncAccounts":
      return handleSyncAccounts(ctx.repo, ctx.resolveLanguage);
    case "refreshAnnouncements":
      await ctx.announcements.forceRefresh(ctx.getAnnouncementOptions());
      ctx.schedulePublishState();
      return undefined;
    case "markAnnouncementRead":
      await ctx.announcements.markAsRead(payload?.announcementId ?? "");
      ctx.schedulePublishState();
      return undefined;
    case "markAllAnnouncementsRead":
      await ctx.announcements.markAllAsRead(ctx.getAnnouncementOptions());
      ctx.schedulePublishState();
      return undefined;
    case "shareTokens":
      return handleShareTokens(ctx.repo, payload, translate);
    case "restoreFromBackup":
      return handleRestoreFromBackup(ctx.repo, ctx.schedulePublishState, translate);
    case "restoreFromAuthJson":
      return handleRestoreFromAuthJson(ctx.repo, ctx.schedulePublishState, translate);
    case "copyText":
      return handleCopyText(payload);
    case "openExternalUrl":
      return handleOpenExternalUrl(payload);
    case "downloadJsonFile":
      return handleDownloadJsonFile(ctx.context, payload);
    case "downloadAccountAuthJson":
      return handleDownloadAccountAuthJson(ctx.context, ctx.repo, account);
    case "copyAccountAuthJson":
      return handleCopyAccountAuthJson(ctx.repo, account);
    case "importSharedJson":
      return handleImportSharedJson(ctx.repo, ctx.schedulePublishState, payload, translate);
    case "previewImportSharedJson":
      return handlePreviewImportSharedJson(ctx.repo, payload, translate);
    case "prepareOAuthSession":
      return ctx.oauth.prepareSession(translate);
    case "cancelOAuthSession":
      ctx.oauth.cancelSession(payload?.oauthSessionId);
      return undefined;
    case "startOAuthAutoFlow":
      return ctx.oauth.startAutoFlow(payload?.oauthSessionId, translate);
    case "completeOAuthSession":
      return ctx.oauth.completeSession(payload?.oauthSessionId, payload?.callbackUrl, translate);
    case "refreshView":
      ctx.reloadShell();
      return undefined;
    case "updateTags":
      return handleUpdateTags(ctx.repo, ctx.resolveLanguage, ctx.schedulePublishState, payload, account, translate);
    case "setAutoSwitchLock":
      return handleAutoSwitchLock(payload, account, ctx.schedulePublishState);
    case "batchRefresh":
      return handleBatchRefresh(ctx.repo, ctx.schedulePublishState, payload, translate);
    case "batchResyncProfile":
      return handleBatchResync(ctx.repo, ctx.schedulePublishState, payload, translate);
    case "batchRemove":
      return handleBatchRemove(ctx.repo, payload, translate, ctx.schedulePublishState);
    case "reloadPrompt":
      return handleReloadPrompt(account);
    case "reauthorize":
      if (account) {
        await vscode.commands.executeCommand("codexAccounts.reauthorizeAccount", account);
      }
      return undefined;
    case "resyncProfile":
      if (account) {
        await resyncAccountInfo(ctx.repo, account.id);
        ctx.schedulePublishState();
      }
      return undefined;
    case "dismissHealthIssue":
      if (account) {
        await ctx.repo.dismissHealthIssue(account.id, payload?.issueKey);
        ctx.schedulePublishState();
      }
      return undefined;
    case "details":
      if (account) {
        await vscode.commands.executeCommand("codexAccounts.openDetails", account, {
          privacyMode: payload?.privacyMode === true
        });
      }
      return undefined;
    case "switch":
      if (account) {
        await vscode.commands.executeCommand("codexAccounts.switchAccount", account);
      }
      return undefined;
    case "switchRestartExtensionHost":
      if (account) {
        await vscode.commands.executeCommand("codexAccounts.switchAccountRestartExtensionHost", account);
      }
      return undefined;
    case "refresh":
      if (account) {
        await vscode.commands.executeCommand("codexAccounts.refreshQuota", account);
      }
      return undefined;
    case "remove":
      if (account) {
        await vscode.commands.executeCommand("codexAccounts.removeAccount", account);
      }
      return undefined;
    case "toggleStatusBar":
      if (account) {
        await vscode.commands.executeCommand("codexAccounts.toggleStatusBarAccount", account);
      }
      return undefined;
    default:
      return undefined;
  }
}

async function handleShareTokens(
  repo: AccountsRepository,
  payload: DashboardActionPayload | undefined,
  translate: ReturnType<typeof t>
) {
  try {
    const accountIds = payload?.accountIds ?? [];
    const shared = await repo.exportSharedAccounts(accountIds);
    if (shared.length === 0) {
      const message = translate("message.shareTokensFailed", { message: "No accounts selected" });
      void vscode.window.showErrorMessage(message);
      throw new Error(message);
    }

    void vscode.window.showInformationMessage(
      translate("message.shareTokensReady", {
        count: shared.length
      })
    );
    return {
      sharedJson: JSON.stringify(shared, null, 2)
    };
  } catch (error) {
    const message = translate("message.shareTokensFailed", {
      message: toFailureMessage(error)
    });
    void vscode.window.showErrorMessage(message);
    throw new Error(message);
  }
}

async function handleRestoreFromBackup(
  repo: AccountsRepository,
  schedulePublishState: () => void,
  translate: ReturnType<typeof t>
) {
  try {
    const restored = await repo.restoreIndexFromLatestBackup();
    schedulePublishState();
    void vscode.window.showInformationMessage(
      translate("message.restoreFromBackupSuccess", {
        count: restored.restoredCount
      })
    );
    return {
      restoredCount: restored.restoredCount
    };
  } catch (error) {
    const message = translate("message.restoreFromBackupFailed", {
      message: toFailureMessage(error)
    });
    void vscode.window.showErrorMessage(message);
    throw new Error(message);
  }
}

async function handleRestoreFromAuthJson(
  repo: AccountsRepository,
  schedulePublishState: () => void,
  translate: ReturnType<typeof t>
) {
  try {
    const restored = await repo.restoreAccountsFromAuthFile();
    schedulePublishState();
    void vscode.window.showInformationMessage(
      translate("message.restoreFromAuthSuccess", {
        count: restored.restoredCount
      })
    );
    return {
      restoredCount: restored.restoredCount
    };
  } catch (error) {
    const message = translate("message.restoreFromAuthFailed", {
      message: toFailureMessage(error)
    });
    void vscode.window.showErrorMessage(message);
    throw new Error(message);
  }
}

async function handleCopyText(payload: DashboardActionPayload | undefined) {
  const text = payload?.text ?? "";
  if (!text) {
    return undefined;
  }
  await vscode.env.clipboard.writeText(text);
  return undefined;
}

async function handleOpenExternalUrl(payload: DashboardActionPayload | undefined) {
  const url = payload?.url?.trim();
  if (!url) {
    return undefined;
  }
  await vscode.env.openExternal(vscode.Uri.parse(url));
  return undefined;
}

async function handleDownloadJsonFile(
  context: vscode.ExtensionContext,
  payload: DashboardActionPayload | undefined
) {
  const text = payload?.text ?? "";
  const defaultName = payload?.filename?.trim() ?? "codex-accounts-manager-share.json";
  if (!text) {
    return undefined;
  }

  try {
    const target = await vscode.window.showSaveDialog({
      defaultUri: resolveDownloadDefaultUri(context, defaultName),
      filters: {
        JSON: ["json"]
      },
      saveLabel: "Save JSON"
    });
    if (!target) {
      return undefined;
    }

    await vscode.workspace.fs.writeFile(target, Buffer.from(text, "utf8"));
    void vscode.window.showInformationMessage(`Saved JSON to ${target.fsPath}`);
    return undefined;
  } catch (error) {
    try {
      await vscode.env.clipboard.writeText(text);
      void vscode.window.showWarningMessage(
        `Unable to open the save dialog. The JSON was copied to your clipboard instead.`
      );
      return undefined;
    } catch (clipboardError) {
      void vscode.window.showErrorMessage(
        `Unable to save or copy the JSON: ${toFailureMessage(clipboardError)}`
      );
      throw clipboardError;
    }
  }

  return undefined;
}

async function handleDownloadAccountAuthJson(
  context: vscode.ExtensionContext,
  repo: AccountsRepository,
  account: CodexAccountRecord | undefined
) {
  if (!account) {
    return undefined;
  }

  const authFile = await repo.exportAccountAuthFile(account.id);
  const filename = createAccountAuthFilename(account.email);
  return handleDownloadJsonFile(context, {
    filename,
    text: JSON.stringify(authFile, null, 2)
  });
}

async function handleCopyAccountAuthJson(repo: AccountsRepository, account: CodexAccountRecord | undefined) {
  if (!account) {
    return undefined;
  }

  const authFile = await repo.exportAccountAuthFile(account.id);
  await vscode.env.clipboard.writeText(JSON.stringify(authFile, null, 2));
  void vscode.window.showInformationMessage(`Copied ${account.email} auth.json to the clipboard.`);
  return undefined;
}

async function handleSyncAccounts(
  repo: AccountsRepository,
  resolveLanguage: () => DashboardLanguage
): Promise<undefined> {
  const syncPath = resolveSharedSyncFilePath();
  const localAccounts = await repo.listAccounts();
  const localSharedAccounts = await repo.exportSharedAccounts(localAccounts.map((account) => account.id));

  let mergedAccounts = localSharedAccounts;
  try {
    const existingText = await fs.readFile(syncPath, "utf8");
    const existingJson = parseSharedJsonInput(existingText);
    mergedAccounts = mergeSharedAccounts(
      Array.isArray(existingJson) ? existingJson : [existingJson],
      localSharedAccounts
    );
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }

  await repo.importSharedAccountsWithSummary(mergedAccounts);
  await fs.mkdir(path.dirname(syncPath), { recursive: true });
  await fs.writeFile(syncPath, JSON.stringify(mergedAccounts, null, 2), "utf8");
  void vscode.window.showInformationMessage(resolveSyncSuccessMessage(resolveLanguage(), mergedAccounts.length, syncPath));
  return undefined;
}

function resolveSharedSyncFilePath(): string {
  if (process.platform === "win32") {
    const publicDir = process.env["PUBLIC"]?.trim();
    return path.join(publicDir ?? path.join(os.homedir(), "Public"), CODEX_SHARED_SYNC_FILENAME);
  }

  const windowsPublicDir = "/mnt/c/Users/Public";
  return path.join(windowsPublicDir, CODEX_SHARED_SYNC_FILENAME);
}

function mergeSharedAccounts(
  existingAccounts: SharedCodexAccountJson[],
  localAccounts: SharedCodexAccountJson[]
): SharedCodexAccountJson[] {
  const merged = new Map<string, SharedCodexAccountJson>();

  existingAccounts.forEach((account) => {
    merged.set(resolveSharedAccountKey(account), account);
  });
  localAccounts.forEach((account) => {
    merged.set(resolveSharedAccountKey(account), account);
  });

  return [...merged.values()];
}

function resolveSharedAccountKey(account: SharedCodexAccountJson): string {
  return String(account.id ?? account.email ?? JSON.stringify(account.tokens ?? {}));
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function resolveSyncSuccessMessage(lang: DashboardLanguage, count: number, syncPath: string): string {
  if (lang === "pt-br") {
    return `Sincronizadas ${count} conta(s) usando ${syncPath}.`;
  }

  return `Synced ${count} account(s) using ${syncPath}.`;
}

function createAccountAuthFilename(email: string): string {
  const slug = email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "account"}-auth.json`;
}

function resolveDownloadDefaultUri(context: vscode.ExtensionContext, filename: string): vscode.Uri {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const storageDir = context.globalStorageUri.fsPath;
  const baseDir = workspaceFolder ?? storageDir ?? os.homedir();
  return vscode.Uri.file(path.join(baseDir, filename));
}

async function handleImportSharedJson(
  repo: AccountsRepository,
  schedulePublishState: () => void,
  payload: DashboardActionPayload | undefined,
  translate: ReturnType<typeof t>
) {
  let parsed: ReturnType<typeof parseSharedJsonInput>;
  try {
    parsed = parseSharedJsonInput(payload?.jsonText ?? "", (message) =>
      translate("message.sharedJsonParseFailed", { message })
    );
  } catch (error) {
    const message = toFailureMessage(error);
    void vscode.window.showErrorMessage(message);
    throw error;
  }

  try {
    const result = payload?.recoveryMode
      ? await repo.restoreAccountsFromSharedJson(parsed)
      : await repo.importSharedAccountsWithSummary(parsed);
    schedulePublishState();
    void vscode.window.showInformationMessage(
      translate(payload?.recoveryMode ? "message.restoreFromSharedSuccess" : "message.importSharedJsonSuccess", {
        count: "successCount" in result ? result.successCount : result.restoredCount
      })
    );
    return toImportActionPayload(result);
  } catch (error) {
    const message = translate(payload?.recoveryMode ? "message.restoreFromSharedFailed" : "message.importSharedJsonFailed", {
      message: toFailureMessage(error)
    });
    void vscode.window.showErrorMessage(message);
    throw new Error(message);
  }
}

async function handlePreviewImportSharedJson(
  repo: AccountsRepository,
  payload: DashboardActionPayload | undefined,
  translate: ReturnType<typeof t>
) {
  const jsonText = payload?.jsonText?.trim();
  if (!jsonText) {
    return {
      importPreview: {
        total: 0,
        valid: 0,
        overwriteCount: 0,
        invalidCount: 0,
        invalidEntries: []
      }
    };
  }

  const parsed = parseSharedJsonInput(jsonText, (message) => translate("message.sharedJsonParseFailed", { message }));
  return {
    importPreview: await repo.previewSharedAccountsImport(parsed)
  };
}

async function handleUpdateTags(
  repo: AccountsRepository,
  resolveLanguage: () => DashboardLanguage,
  schedulePublishState: () => void,
  payload: DashboardActionPayload | undefined,
  account: CodexAccountRecord | undefined,
  translate: ReturnType<typeof t>
) {
  const targetIds = payload?.accountIds?.length ? payload.accountIds : account ? [account.id] : [];
  if (!targetIds.length) {
    return undefined;
  }
  const dashboardCopy = getDashboardCopy(resolveLanguage());
  const targetAccount = targetIds.length === 1 ? account ?? (await repo.getAccount(targetIds[0]!)) : undefined;
  const mode = payload?.mode === "add" || payload?.mode === "remove" ? payload.mode : "set";
  const tags = await promptForTags({
    copy: dashboardCopy,
    mode,
    initialTags: targetAccount?.tags ?? [],
    label: targetIds.length === 1 ? targetAccount?.email : undefined
  });
  if (tags === undefined) {
    return undefined;
  }

  if (mode === "add") {
    await repo.addAccountTags(targetIds, tags);
  } else if (mode === "remove") {
    await repo.removeAccountTags(targetIds, tags);
  } else if (targetIds.length === 1) {
    await repo.setAccountTags(targetIds[0]!, tags);
  } else {
    await repo.addAccountTags(targetIds, tags);
  }
  schedulePublishState();
  void vscode.window.showInformationMessage(
    translate("message.batchTagsSummary", {
      count: targetIds.length,
      action:
        mode === "add"
          ? dashboardCopy.addTagsBtn
          : mode === "remove"
            ? dashboardCopy.removeTagsBtn
            : dashboardCopy.editTagsBtn
    })
  );
  return undefined;
}

function handleAutoSwitchLock(
  payload: DashboardActionPayload | undefined,
  account: CodexAccountRecord | undefined,
  schedulePublishState: () => void
) {
  const lockAccountId = account?.id ?? payload?.accountIds?.[0];
  const lockMinutes = typeof payload?.lockMinutes === "number" ? payload.lockMinutes : 0;
  if (!lockAccountId) {
    return undefined;
  }

  if (lockMinutes > 0) {
    setAutoSwitchLock(lockAccountId, lockMinutes);
  } else {
    clearAutoSwitchLock(lockAccountId);
  }
  schedulePublishState();
  return undefined;
}

async function handleBatchRefresh(
  repo: AccountsRepository,
  schedulePublishState: () => void,
  payload: DashboardActionPayload | undefined,
  translate: ReturnType<typeof t>
) {
  const targetIds = payload?.accountIds ?? [];
  const accountsById = new Map(await Promise.all(targetIds.map(async (id) => [id, await repo.getAccount(id)] as const)));
  let success = 0;
  let failed = 0;
  const failures: DashboardBatchResultFailure[] = [];
  await runWithConcurrencyLimit(
    targetIds,
    CODEX_BATCH_REFRESH_CONCURRENCY,
    async (id) => {
      try {
        await refreshSingleQuota(repo, { refresh() {} }, id, {
          announce: false,
          forceRefresh: true,
          refreshView: false,
          warnQuota: false
        });
        success += 1;
      } catch (error) {
        failed += 1;
        failures.push({
          accountId: id,
          email: accountsById.get(id)?.email,
          message: toFailureMessage(error)
        });
        console.warn(`[codexAccounts] batch quota refresh failed for ${id}:`, error);
      }
    },
    { delayMs: CODEX_BATCH_REFRESH_DELAY_MS }
  );
  schedulePublishState();
  const message = translate("message.batchRefreshSummary", {
    success,
    failed
  });
  if (failed > 0) {
    void vscode.window.showWarningMessage(message);
  } else {
    void vscode.window.showInformationMessage(message);
  }
  return {
    batchResult: {
      kind: "batch_refresh" as const,
      successCount: success,
      failedCount: failed,
      failures
    }
  };
}

async function handleBatchResync(
  repo: AccountsRepository,
  schedulePublishState: () => void,
  payload: DashboardActionPayload | undefined,
  translate: ReturnType<typeof t>
) {
  const targetIds = payload?.accountIds ?? [];
  const accountsById = new Map(await Promise.all(targetIds.map(async (id) => [id, await repo.getAccount(id)] as const)));
  let success = 0;
  let failed = 0;
  const failures: DashboardBatchResultFailure[] = [];
  await runWithConcurrencyLimit(targetIds, 4, async (id) => {
    try {
      await resyncAccountInfo(repo, id);
      success += 1;
    } catch (error) {
      failed += 1;
      failures.push({
        accountId: id,
        email: accountsById.get(id)?.email,
        message: toFailureMessage(error)
      });
      console.warn(`[codexAccounts] batch profile resync failed for ${id}:`, error);
    }
  }, { delayMs: CODEX_BATCH_REFRESH_DELAY_MS });
  schedulePublishState();
  const message = translate("message.batchResyncSummary", {
    success,
    failed
  });
  if (failed > 0) {
    void vscode.window.showWarningMessage(message);
  } else {
    void vscode.window.showInformationMessage(message);
  }
  return {
    batchResult: {
      kind: "batch_resync" as const,
      successCount: success,
      failedCount: failed,
      failures
    }
  };
}

async function resyncAccountInfo(repo: AccountsRepository, accountId: string): Promise<void> {
  await repo.refreshAccountProfileMetadata(accountId);
  await refreshSingleQuota(repo, { refresh() {} }, accountId, {
    announce: false,
    forceRefresh: true,
    refreshView: false,
    warnQuota: false
  });
}

async function handleBatchRemove(
  repo: AccountsRepository,
  payload: DashboardActionPayload | undefined,
  translate: ReturnType<typeof t>,
  schedulePublishState: () => void
) {
  const targetIds = payload?.accountIds ?? [];
  if (!targetIds.length) {
    return undefined;
  }
  const accountsById = new Map(await Promise.all(targetIds.map(async (id) => [id, await repo.getAccount(id)] as const)));
  const choice = await vscode.window.showWarningMessage(
    translate("message.batchRemoveConfirm", { count: targetIds.length }),
    { modal: true },
    translate("confirm.removeButton")
  );
  if (choice !== translate("confirm.removeButton")) {
    return undefined;
  }
  let removed = 0;
  let failed = 0;
  const failures: DashboardBatchResultFailure[] = [];
  for (const id of targetIds) {
    try {
      await repo.removeAccount(id);
      removed += 1;
    } catch (error) {
      failed += 1;
      failures.push({
        accountId: id,
        email: accountsById.get(id)?.email,
        message: toFailureMessage(error)
      });
      console.warn(`[codexAccounts] batch remove failed for ${id}:`, error);
    }
  }
  schedulePublishState();
  const message = translate("message.batchRemoveSummary", {
    count: removed,
    failed
  });
  if (failed > 0) {
    void vscode.window.showWarningMessage(message);
  } else {
    void vscode.window.showInformationMessage(message);
  }
  return {
    batchResult: {
      kind: "batch_remove" as const,
      successCount: removed,
      failedCount: failed,
      failures
    }
  };
}

async function handleReloadPrompt(account: CodexAccountRecord | undefined) {
  if (account) {
    const copy = getCommandCopy();
    const choice = await vscode.window.showInformationMessage(
      copy.switchedAndAskReload(account.email),
      copy.reloadNow,
      copy.later
    );
    if (choice === copy.reloadNow) {
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
  }
  return undefined;
}
