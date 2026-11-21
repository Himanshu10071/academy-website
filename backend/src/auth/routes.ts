import { Router } from "express";

import { authenticate } from "./service.ts";

export const authRoutes = Router();

authRoutes.get("/me", async (request, response) => {
  response.set("Cache-Control", "no-store");
  const token = /^Bearer ([^\s]+)$/i.exec(request.get("Authorization") ?? "")?.[1];

  try {
    const result = await authenticate(token);
    switch (result.kind) {
      case "unauthenticated":
        response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } });
        return;
      case "forbidden":
        response.status(403).json({ error: { code: "FORBIDDEN", message: "This account cannot access the academy." } });
        return;
      case "authenticated":
        response.json({ profile: result.profile });
        return;
    }
  } catch {
    response.status(503).json({ error: { code: "AUTH_UNAVAILABLE", message: "Sign-in is temporarily unavailable." } });
  }
});
