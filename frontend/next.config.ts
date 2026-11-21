import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000";

const config: NextConfig = {
  async rewrites() {
    return [{ source: "/api/auth/me", destination: new URL("/auth/me", backendUrl).href }];
  },
};

export default config;
