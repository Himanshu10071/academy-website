import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

let port;
try {
  const backendEnv = readFileSync(new URL("../backend/.env", import.meta.url), "utf8");
  port = Number(parseEnv(backendEnv).PORT);
} catch {
  process.stderr.write("Could not read backend/.env.\n");
  process.exit(1);
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.stderr.write("Set a valid PORT in backend/.env before starting the tunnel.\n");
  process.exit(1);
}

const tunnel = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], { stdio: "inherit" });
tunnel.on("error", (error) => {
  const message = error.code === "ENOENT"
    ? "Install cloudflared and make sure it is on your PATH."
    : "Could not start cloudflared.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
tunnel.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
});
