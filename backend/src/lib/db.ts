import pg, { type PoolClient } from "pg";

import { env } from "../config/env.ts";
import { logger } from "./logger.ts";

export const database = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  max: env.DATABASE_POOL_MAX,
  connectionTimeoutMillis: 5_000,
  query_timeout: 5_000,
});

database.on("error", () => {
  logger.error("An idle database connection failed.");
});

export async function checkDatabase() {
  await database.query("SELECT 1");
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.connect();
  let discardConnection = false;

  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discardConnection = true;
    }
    throw error;
  } finally {
    client.release(discardConnection);
  }
}
