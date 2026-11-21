import pg from "pg";

import { config } from "./config.ts";

export const database = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: true,
  max: 5,
  connectionTimeoutMillis: 5_000,
});

database.on("error", () => {
  console.error("An idle PostgreSQL connection failed.");
});
