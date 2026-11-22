import type { ErrorCode } from "../constants/error-codes.js";
import type { Role } from "../constants/roles.js";

export type Profile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
};

export type UpdateProfile = { name?: string; phone?: string };
export type ApiFailure = { error: { code: ErrorCode; message: string; requestId: string } };
