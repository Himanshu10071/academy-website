import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
process.env.DATABASE_URL = "postgresql://test@localhost/academy";

let authResponse;
globalThis.fetch = async (url, options) => {
  assert.equal(String(url), "https://supabase.example/auth/v1/user");
  const headers = new Headers(options.headers);
  assert.equal(headers.get("authorization"), "Bearer test-token");
  assert.equal(headers.get("apikey"), "test-publishable-key");
  return Response.json(authResponse.body, { status: authResponse.status });
};

const { authenticate } = await import("../src/auth/service.ts");
const { database, withTransaction } = await import("../src/lib/db.ts");

const userId = "8bd42cf1-42cf-4c0d-aa90-e6df6959e5ec";
const profile = {
  id: userId,
  user_name: "Test Student",
  email: "student@example.test",
  phone_number: null,
  role: "student",
  is_blocked: false,
};

test("Google authentication and profile access", async (t) => {
  const cases = [
    { name: "missing bearer token", token: undefined, expected: "unauthenticated" },
    { name: "invalid bearer token", status: 401, expected: "unauthenticated" },
    { name: "non-Google user", provider: "email", expected: "forbidden" },
    { name: "missing profile", rows: [], expected: "forbidden" },
    { name: "blocked account", rows: [{ ...profile, is_blocked: true }], expected: "forbidden" },
    { name: "unexpected database role", rows: [{ ...profile, role: "teacher" }], expected: "forbidden" },
    { name: "student without a phone", rows: [profile], expected: "authenticated", role: "student" },
    { name: "admin assigned in PostgreSQL", rows: [{ ...profile, role: "admin" }], expected: "authenticated", role: "admin" },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async (t) => {
      authResponse = {
        status: scenario.status ?? 200,
        body: scenario.status ? { message: "Invalid token" } : {
          id: userId,
          app_metadata: { provider: scenario.provider ?? "google", role: "admin" },
        },
      };
      const query = t.mock.method(database, "query", async (sql, values) => {
        assert.match(sql, /FROM public\.profiles\s+WHERE id = \$1/);
        assert.deepEqual(values, [userId]);
        return { rows: scenario.rows };
      });
      const token = "token" in scenario ? scenario.token : "test-token";
      const result = await authenticate(token);
      assert.equal(result.kind, scenario.expected);
      assert.equal(query.mock.callCount(), scenario.rows ? 1 : 0);
      if (scenario.role) {
        assert.equal(result.profile.role, scenario.role);
        assert.equal(result.profile.phoneNumber, null);
      }
    });
  }

  await t.test("a database outage is propagated as a dependency error", async (t) => {
    t.mock.method(database, "query", async () => { throw new Error("database unavailable"); });
    await assert.rejects(authenticate("test-token"), /database unavailable/);
  });
});

test("transactions commit or roll back and release the same connection", async (t) => {
  for (const scenario of ["success", "failure", "rollback fails"]) {
    await t.test(scenario, async (t) => {
      const steps = [];
      const failure = new Error("write failed");
      const client = {
        async query(sql) {
          steps.push(sql);
          if (sql === "ROLLBACK" && scenario === "rollback fails") throw new Error("connection lost");
        },
        release(discard) {
          steps.push(discard ? "discard" : "release");
        },
      };
      t.mock.method(database, "connect", async () => client);
      const transaction = withTransaction(async (connection) => {
        assert.equal(connection, client);
        await connection.query("write");
        if (scenario !== "success") throw failure;
        return "result";
      });
      if (scenario === "success") {
        assert.equal(await transaction, "result");
        assert.deepEqual(steps, ["BEGIN", "write", "COMMIT", "release"]);
      } else {
        await assert.rejects(transaction, { message: failure.message });
        assert.deepEqual(steps, ["BEGIN", "write", "ROLLBACK", scenario === "failure" ? "release" : "discard"]);
      }
    });
  }
});
