import { app } from "./app.ts";
import { env } from "./config/env.ts";
import { logger } from "./lib/logger.ts";

app.listen(env.PORT, (error) => {
  if (error) {
    logger.error({ module: "server", action: "startup_failed", port: env.PORT });
    process.exitCode = 1;
    return;
  }
  logger.info({ module: "server", action: "listening", port: env.PORT });
});
