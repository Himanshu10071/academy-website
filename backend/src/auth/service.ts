import { findProfile, verifyAccessToken } from "./data.ts";

export async function authenticate(token: string | undefined) {
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return { kind: "unauthenticated" } as const;

  if (user.app_metadata.provider !== "google") {
    return { kind: "forbidden" } as const;
  }

  const profile = await findProfile(user.id);
  if (!profile || profile.isBlocked) return { kind: "forbidden" } as const;

  const { id, name, email, phoneNumber, role } = profile;
  if (role !== "student" && role !== "admin") return { kind: "forbidden" } as const;

  return { kind: "authenticated", profile: { id, name, email, phoneNumber, role } } as const;
}
