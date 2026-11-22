export const ROLE = { STUDENT: "student", ADMIN: "admin" } as const;
export type Role = (typeof ROLE)[keyof typeof ROLE];
