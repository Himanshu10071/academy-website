import express from "express";

import { config } from "./config.ts";
import { authRoutes } from "./auth/routes.ts";

const app = express();

app.disable("x-powered-by");

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.use("/auth", authRoutes);

app.use((_request, response) => {
  response.status(404).json({
    error: { code: "NOT_FOUND", message: "Route not found." },
  });
});

app.listen(config.port, (error) => {
  if (error) {
    console.error("Could not start the backend.", error.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Backend listening on port ${config.port}.`);
});
