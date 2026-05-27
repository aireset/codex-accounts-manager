import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import type { CodexTokens } from "../src/core/types";

const { writeAuthFileMock, readAuthFileMock } = vi.hoisted(() => ({
  writeAuthFileMock: vi.fn(),
  readAuthFileMock: vi.fn()
}));

vi.mock("../src/codex", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/codex")>();
  return {
    ...actual,
    readAuthFile: readAuthFileMock,
    writeAuthFile: writeAuthFileMock
  };
});

import { AccountsRepository } from "../src/storage";
import { buildAccountStorageId } from "../src/utils/accountIdentity";

function createJwt(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${encoded}.signature`;
}

function createTokens(accountId = "acct_123"): CodexTokens {
  return {
    idToken: createJwt({
      email: "dev@example.com",
      "https://api.openai.com/auth": {
        chatgpt_account_id: accountId
      }
    }),
    accessToken: createJwt({
      "https://api.openai.com/auth": {
        chatgpt_account_id: accountId
      }
    }),
    refreshToken: "refresh-token",
    accountId
  };
}

describe("AccountsRepository token persistence", () => {
  let tempDir: string;
  let originalAideckDataDir: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-accounts-test-"));
    originalAideckDataDir = process.env.AIDECK_DATA_DIR;
    process.env.AIDECK_DATA_DIR = path.join(tempDir, "aideck-data");
    writeAuthFileMock.mockReset();
    readAuthFileMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (originalAideckDataDir === undefined) {
      delete process.env.AIDECK_DATA_DIR;
    } else {
      process.env.AIDECK_DATA_DIR = originalAideckDataDir;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("syncs active auth.json when quota refresh produces updated tokens", async () => {
    const secrets = new Map<string, string>();
    const context = {
      globalStorageUri: {
        fsPath: tempDir
      },
      secrets: {
        get: vi.fn(async (key: string) => secrets.get(key)),
        store: vi.fn(async (key: string, value: string) => {
          secrets.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
          secrets.delete(key);
        })
      }
    } as unknown as vscode.ExtensionContext;
    await fs.writeFile(
      path.join(tempDir, "accounts-index.json"),
      JSON.stringify({
        currentAccountId: "account-1",
        accounts: [
          {
            id: "account-1",
            email: "dev@example.com",
            accountName: "Dev",
            accountId: "acct_123",
            isActive: true,
            createdAt: 1,
            updatedAt: 1,
            quotaError: {
              message: "Token expired",
              timestamp: 1
            }
          }
        ]
      }),
      "utf8"
    );

    const repo = new AccountsRepository(context);
    const updatedTokens = createTokens("acct_123");

    await repo.updateQuota("account-1", undefined, undefined, updatedTokens);

    expect(writeAuthFileMock).toHaveBeenCalledWith(updatedTokens);
    expect(JSON.parse(secrets.get("codex.account.account-1") ?? "{}")).toMatchObject({
      refreshToken: "refresh-token",
      accountId: "acct_123"
    });
    expect((await repo.getAccount("account-1"))?.quotaError).toBeUndefined();

    repo.dispose();
  });

  it("hydrates stored tokens from external auth.json changes without rewriting auth.json", async () => {
    const secrets = new Map<string, string>();
    const context = {
      globalStorageUri: {
        fsPath: tempDir
      },
      secrets: {
        get: vi.fn(async (key: string) => secrets.get(key)),
        store: vi.fn(async (key: string, value: string) => {
          secrets.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
          secrets.delete(key);
        })
      }
    } as unknown as vscode.ExtensionContext;
    const storageId = buildAccountStorageId("dev@example.com", "acct_123", undefined);
    await fs.writeFile(
      path.join(tempDir, "accounts-index.json"),
      JSON.stringify({
        currentAccountId: undefined,
        accounts: [
          {
            id: storageId,
            email: "dev@example.com",
            accountName: "Dev",
            accountId: "acct_123",
            isActive: false,
            createdAt: 1,
            updatedAt: 1,
            quotaError: {
              message: "Token expired",
              timestamp: 1
            }
          }
        ]
      }),
      "utf8"
    );
    await context.secrets.store(`codex.account.${storageId}`, JSON.stringify(createTokens("acct_123")));

    const externalTokens = createTokens("acct_123");
    externalTokens.accessToken = createJwt({
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct_123"
      }
    });
    externalTokens.refreshToken = "refreshed-token";
    readAuthFileMock.mockResolvedValue({
      OPENAI_API_KEY: null,
      tokens: {
        id_token: externalTokens.idToken,
        access_token: externalTokens.accessToken,
        refresh_token: externalTokens.refreshToken,
        account_id: externalTokens.accountId
      },
      last_refresh: new Date().toISOString()
    });

    const repo = new AccountsRepository(context);
    await repo.syncActiveAccountFromAuthFile();

    expect(writeAuthFileMock).not.toHaveBeenCalled();
    expect(JSON.parse(secrets.get(`codex.account.${storageId}`) ?? "{}")).toMatchObject({
      refreshToken: "refreshed-token",
      accountId: "acct_123"
    });
    expect((await repo.getAccount(storageId))?.isActive).toBe(true);
    expect((await repo.getAccount(storageId))?.quotaError).toBeUndefined();

    repo.dispose();
  });

  it("reads fresher Codex tokens from Aideck account storage", async () => {
    const secrets = new Map<string, string>();
    const context = {
      globalStorageUri: {
        fsPath: tempDir
      },
      secrets: {
        get: vi.fn(async (key: string) => secrets.get(key)),
        store: vi.fn(async (key: string, value: string) => {
          secrets.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
          secrets.delete(key);
        })
      }
    } as unknown as vscode.ExtensionContext;
    const storageId = buildAccountStorageId("dev@example.com", "acct_123", undefined);
    await fs.writeFile(
      path.join(tempDir, "accounts-index.json"),
      JSON.stringify({
        currentAccountId: storageId,
        accounts: [
          {
            id: storageId,
            email: "dev@example.com",
            accountName: "Dev",
            accountId: "acct_123",
            isActive: true,
            createdAt: 1,
            updatedAt: 1
          }
        ]
      }),
      "utf8"
    );
    await context.secrets.store(`codex.account.${storageId}`, JSON.stringify(createTokens("acct_123")));

    const externalTokens = createTokens("acct_123");
    externalTokens.refreshToken = "aideck-refreshed-token";
    const aideckAccountFile = path.join(
      process.env.AIDECK_DATA_DIR as string,
      "accounts",
      "codex",
      "accounts",
      `${storageId}.json`
    );
    await fs.mkdir(path.dirname(aideckAccountFile), { recursive: true });
    await fs.writeFile(
      aideckAccountFile,
      JSON.stringify({
        id: storageId,
        email: "dev@example.com",
        tokens: {
          id_token: externalTokens.idToken,
          access_token: externalTokens.accessToken,
          refresh_token: externalTokens.refreshToken,
          account_id: externalTokens.accountId
        }
      }),
      "utf8"
    );

    const repo = new AccountsRepository(context);
    const merged = await repo.getTokens(storageId);

    expect(merged?.refreshToken).toBe("aideck-refreshed-token");
    expect(JSON.parse(secrets.get(`codex.account.${storageId}`) ?? "{}")).toMatchObject({
      refreshToken: "aideck-refreshed-token",
      accountId: "acct_123"
    });

    repo.dispose();
  });

  it("exports a saved account as auth.json", async () => {
    const secrets = new Map<string, string>();
    const context = {
      globalStorageUri: {
        fsPath: tempDir
      },
      secrets: {
        get: vi.fn(async (key: string) => secrets.get(key)),
        store: vi.fn(async (key: string, value: string) => {
          secrets.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
          secrets.delete(key);
        })
      }
    } as unknown as vscode.ExtensionContext;
    const storageId = buildAccountStorageId("dev@example.com", "acct_123", undefined);
    await fs.writeFile(
      path.join(tempDir, "accounts-index.json"),
      JSON.stringify({
        currentAccountId: storageId,
        accounts: [
          {
            id: storageId,
            email: "dev@example.com",
            accountName: "Dev",
            accountId: "acct_123",
            isActive: true,
            createdAt: 1,
            updatedAt: 1
          }
        ]
      }),
      "utf8"
    );
    await context.secrets.store(`codex.account.${storageId}`, JSON.stringify(createTokens("acct_123")));

    const repo = new AccountsRepository(context);
    const authFile = await repo.exportAccountAuthFile(storageId);

    expect(authFile.OPENAI_API_KEY).toBeNull();
    expect(authFile.tokens).toMatchObject({
      id_token: createTokens("acct_123").idToken,
      access_token: createTokens("acct_123").accessToken,
      refresh_token: "refresh-token",
      account_id: "acct_123"
    });
    expect(authFile.last_refresh).toEqual(expect.any(String));

    repo.dispose();
  });

  it("exports saved accounts as OmniRoute Codex bulk import JSON", async () => {
    const secrets = new Map<string, string>();
    const context = {
      globalStorageUri: {
        fsPath: tempDir
      },
      secrets: {
        get: vi.fn(async (key: string) => secrets.get(key)),
        store: vi.fn(async (key: string, value: string) => {
          secrets.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
          secrets.delete(key);
        })
      }
    } as unknown as vscode.ExtensionContext;
    const firstId = buildAccountStorageId("dev@example.com", "acct_123", undefined);
    const secondId = buildAccountStorageId("ops@example.com", "acct_456", undefined);

    await fs.writeFile(
      path.join(tempDir, "accounts-index.json"),
      JSON.stringify({
        currentAccountId: firstId,
        accounts: [
          {
            id: firstId,
            email: "dev@example.com",
            accountName: "Dev Workspace",
            accountId: "acct_123",
            isActive: true,
            createdAt: 1,
            updatedAt: 1
          },
          {
            id: secondId,
            email: "ops@example.com",
            accountName: "Ops Workspace",
            accountId: "acct_456",
            isActive: false,
            createdAt: 2,
            updatedAt: 2
          }
        ]
      }),
      "utf8"
    );

    await context.secrets.store(`codex.account.${firstId}`, JSON.stringify(createTokens("acct_123")));
    await context.secrets.store(`codex.account.${secondId}`, JSON.stringify(createTokens("acct_456")));

    const repo = new AccountsRepository(context);
    const exportFile = await repo.exportOmniRouteAuthImport([firstId, secondId]);

    expect(exportFile.overwriteExisting).toBe(false);
    expect(exportFile.entries).toHaveLength(2);
    expect(exportFile.entries[0]).toMatchObject({
      name: "Dev Workspace",
      email: "dev@example.com",
      json: {
        OPENAI_API_KEY: null,
        tokens: {
          id_token: createTokens("acct_123").idToken,
          access_token: createTokens("acct_123").accessToken,
          refresh_token: createTokens("acct_123").refreshToken,
          account_id: "acct_123"
        }
      }
    });
    expect(exportFile.entries[1]).toMatchObject({
      name: "Ops Workspace",
      email: "ops@example.com",
      json: {
        OPENAI_API_KEY: null,
        tokens: {
          id_token: createTokens("acct_456").idToken,
          access_token: createTokens("acct_456").accessToken,
          refresh_token: createTokens("acct_456").refreshToken,
          account_id: "acct_456"
        }
      }
    });

    repo.dispose();
  });

  it("does not replace a valid stored access token with an expired Aideck token", async () => {
    const secrets = new Map<string, string>();
    const context = {
      globalStorageUri: {
        fsPath: tempDir
      },
      secrets: {
        get: vi.fn(async (key: string) => secrets.get(key)),
        store: vi.fn(async (key: string, value: string) => {
          secrets.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
          secrets.delete(key);
        })
      }
    } as unknown as vscode.ExtensionContext;
    const storageId = buildAccountStorageId("dev@example.com", "acct_123", undefined);
    await fs.writeFile(
      path.join(tempDir, "accounts-index.json"),
      JSON.stringify({
        currentAccountId: storageId,
        accounts: [
          {
            id: storageId,
            email: "dev@example.com",
            accountName: "Dev",
            accountId: "acct_123",
            isActive: true,
            createdAt: 1,
            updatedAt: 1
          }
        ]
      }),
      "utf8"
    );
    const storedTokens = createTokens("acct_123");
    await context.secrets.store(`codex.account.${storageId}`, JSON.stringify(storedTokens));

    const expiredAideckTokens = createTokens("acct_123");
    expiredAideckTokens.accessToken = createJwt({
      exp: 1,
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct_123"
      }
    });
    expiredAideckTokens.refreshToken = "expired-aideck-refresh";
    const aideckAccountFile = path.join(
      process.env.AIDECK_DATA_DIR as string,
      "accounts",
      "codex",
      "accounts",
      `${storageId}.json`
    );
    await fs.mkdir(path.dirname(aideckAccountFile), { recursive: true });
    await fs.writeFile(
      aideckAccountFile,
      JSON.stringify({
        id: storageId,
        email: "dev@example.com",
        tokens: {
          id_token: expiredAideckTokens.idToken,
          access_token: expiredAideckTokens.accessToken,
          refresh_token: expiredAideckTokens.refreshToken,
          account_id: expiredAideckTokens.accountId
        }
      }),
      "utf8"
    );

    const repo = new AccountsRepository(context);
    const merged = await repo.getTokens(storageId);

    expect(merged?.accessToken).toBe(storedTokens.accessToken);
    expect(merged?.refreshToken).toBe("refresh-token");

    repo.dispose();
  });

  it("mirrors refreshed tokens and quota to Aideck account storage", async () => {
    const secrets = new Map<string, string>();
    const context = {
      globalStorageUri: {
        fsPath: tempDir
      },
      secrets: {
        get: vi.fn(async (key: string) => secrets.get(key)),
        store: vi.fn(async (key: string, value: string) => {
          secrets.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
          secrets.delete(key);
        })
      }
    } as unknown as vscode.ExtensionContext;
    const storageId = buildAccountStorageId("dev@example.com", "acct_123", undefined);
    await fs.writeFile(
      path.join(tempDir, "accounts-index.json"),
      JSON.stringify({
        currentAccountId: storageId,
        accounts: [
          {
            id: storageId,
            email: "dev@example.com",
            accountName: "Dev",
            accountId: "acct_123",
            planType: "plus",
            isActive: true,
            createdAt: 1,
            updatedAt: 1
          }
        ]
      }),
      "utf8"
    );

    const repo = new AccountsRepository(context);
    const updatedTokens = createTokens("acct_123");
    updatedTokens.refreshToken = "shared-refresh-token";

    await repo.updateQuota(
      storageId,
      {
        hourlyPercentage: 91,
        hourlyResetTime: 1_800_000_000,
        hourlyWindowMinutes: 300,
        hourlyWindowPresent: true,
        weeklyPercentage: 64,
        weeklyResetTime: 1_800_100_000,
        weeklyWindowMinutes: 10080,
        weeklyWindowPresent: true,
        codeReviewPercentage: 64,
        codeReviewWindowPresent: false
      },
      undefined,
      updatedTokens,
      undefined,
      "1800000000"
    );

    const aideckAccountFile = path.join(
      process.env.AIDECK_DATA_DIR as string,
      "accounts",
      "codex",
      "accounts",
      `${storageId}.json`
    );
    const aideckAccount = JSON.parse(await fs.readFile(aideckAccountFile, "utf8"));
    expect(aideckAccount.tokens.refresh_token).toBe("shared-refresh-token");
    expect(aideckAccount.quota.hourly_percentage).toBe(91);
    expect(aideckAccount.quota.weekly_percentage).toBe(64);
    expect(aideckAccount.plan_type).toBe("plus");
    expect(aideckAccount.subscription_active_until).toBe("1800000000");

    const aideckCurrent = JSON.parse(
      await fs.readFile(path.join(process.env.AIDECK_DATA_DIR as string, "accounts", "codex", "current.json"), "utf8")
    );
    expect(aideckCurrent.id).toBe(storageId);

    const aideckIndex = JSON.parse(
      await fs.readFile(
        path.join(process.env.AIDECK_DATA_DIR as string, "accounts", "codex", "accounts-index.json"),
        "utf8"
      )
    );
    expect(aideckIndex.accounts).toContainEqual(expect.objectContaining({ id: storageId, has_quota: true }));

    repo.dispose();
  });

  it("exports auth.json arrays for the selected accounts", async () => {
    const secrets = new Map<string, string>();
    const context = {
      globalStorageUri: {
        fsPath: tempDir
      },
      secrets: {
        get: vi.fn(async (key: string) => secrets.get(key)),
        store: vi.fn(async (key: string, value: string) => {
          secrets.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
          secrets.delete(key);
        })
      }
    } as unknown as vscode.ExtensionContext;
    await fs.writeFile(
      path.join(tempDir, "accounts-index.json"),
      JSON.stringify({
        currentAccountId: "account-1",
        accounts: [
          {
            id: "account-1",
            email: "first@example.com",
            accountName: "First",
            accountId: "acct_1",
            isActive: true,
            createdAt: 1,
            updatedAt: 1
          },
          {
            id: "account-2",
            email: "second@example.com",
            accountName: "Second",
            accountId: "acct_2",
            isActive: false,
            createdAt: 2,
            updatedAt: 2
          }
        ]
      }),
      "utf8"
    );
    await context.secrets.store(`codex.account.account-1`, JSON.stringify(createTokens("acct_1")));
    await context.secrets.store(`codex.account.account-2`, JSON.stringify(createTokens("acct_2")));

    const repo = new AccountsRepository(context);
    const exported = await repo.exportAuthJsonArray(["account-1", "account-2"]);

    expect(exported).toHaveLength(2);
    expect(exported[0]?.tokens.account_id).toBe("acct_1");
    expect(exported[1]?.tokens.account_id).toBe("acct_2");
    expect(exported[0]?.OPENAI_API_KEY).toBeNull();
    expect(exported[1]?.OPENAI_API_KEY).toBeNull();

    repo.dispose();
  });
});
