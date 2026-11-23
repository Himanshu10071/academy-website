import { z } from "zod";

const httpUrl = z.url({ protocol: /^https?$/ });
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535),
  FRONTEND_URL: httpUrl.refine((value) => {
    const url = URL.parse(value);
    return url !== null && url.href === url.origin + "/";
  }),
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }).refine((value) => {
    const url = URL.parse(value);
    return Boolean(url?.hostname) && url?.searchParams.get("sslmode") !== "disable" && url?.searchParams.get("ssl") !== "false";
  }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(10),
  SUPABASE_URL: httpUrl,
  SUPABASE_ANON_KEY: z.string().trim().min(1).refine((key) => !key.startsWith("sb_secret_")),
  AWS_REGION: z.string().trim().min(1),
  AWS_ACCESS_KEY_ID: z.string().trim().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().trim().min(1),
  S3_BUCKET: z.string().trim().min(1),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(1).max(900).default(900),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  throw new Error(`Missing or invalid environment variables: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
}

export const env = result.data;
