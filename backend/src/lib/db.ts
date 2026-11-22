import pg, { type PoolClient } from "pg";

import { config } from "../config.ts";

export const database = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: true,
  max: 5,
  connectionTimeoutMillis: 5_000,
});

database.on("error", () => {
  console.error("An idle PostgreSQL connection failed.");
});

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
