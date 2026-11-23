import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ERROR_CODE } from "@academy/shared";

import { env } from "../config/env.ts";
import { AppError } from "./errors.ts";
import { s3 } from "./s3.ts";

export async function getPlaybackUrl(videoKey: string, ttlSeconds: number): Promise<string> {
  try {
    return await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: videoKey, ResponseCacheControl: "private, no-store" }),
      { expiresIn: ttlSeconds },
    );
  } catch {
    throw new AppError(503, ERROR_CODE.UPSTREAM_FAILED, "Could not prepare the playback link.");
  }
}
