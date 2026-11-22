import { env } from "../config/env.ts";

export const logger = {
  info(message: string) {
    if (env.NODE_ENV !== "test") process.stdout.write(`${message}\n`);
  },
  error(message: string) {
    if (env.NODE_ENV !== "test") process.stderr.write(`${message}\n`);
  },
};
