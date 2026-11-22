import { app } from "./app.ts";
import { env } from "./config/env.ts";
import { logger } from "./lib/logger.ts";

app.listen(env.PORT, (error) => {
  if (error) {
    logger.error(`Could not start the API on port ${env.PORT}.`);
    process.exitCode = 1;
    return;
  }
  logger.info(`API listening on port ${env.PORT}.`);
});
