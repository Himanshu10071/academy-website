import type { PoolClient } from "pg";
import { afterEach, expect, it, vi } from "vitest";

import { database, withTransaction } from "./db.ts";

vi.mock("../config/env.ts", () => ({
  env: { NODE_ENV: "test", DATABASE_URL: "postgresql://test@localhost/academy", DATABASE_POOL_MAX: 1 },
}));

afterEach(() => vi.restoreAllMocks());

it.each(["success", "failure", "rollback fails"])("releases the checked-out transaction client after %s", async (scenario) => {
  const calls: string[] = [];
  const client = {
    async query(sql: string) {
      calls.push(sql);
      if (sql === "ROLLBACK" && scenario === "rollback fails") throw new Error("connection lost");
    },
    release(discard: boolean) { calls.push(discard ? "discard" : "release"); },
  } as unknown as PoolClient;
  vi.spyOn(database, "connect").mockImplementation(async () => client);

  const transaction = withTransaction(async (connection) => {
    expect(connection).toBe(client);
    await connection.query("write");
    if (scenario !== "success") throw new Error("write failed");
    return "result";
  });

  if (scenario === "success") {
    await expect(transaction).resolves.toBe("result");
    expect(calls).toEqual(["BEGIN", "write", "COMMIT", "release"]);
  } else {
    await expect(transaction).rejects.toThrow("write failed");
    expect(calls).toEqual(["BEGIN", "write", "ROLLBACK", scenario === "failure" ? "release" : "discard"]);
  }
});
