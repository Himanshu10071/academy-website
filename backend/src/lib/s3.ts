import { HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ERROR_CODE, VIDEO_CONTENT_TYPE } from "@academy/shared";

import { env } from "../config/env.ts";
import { AppError } from "./errors.ts";

const bucket = env.S3_BUCKET;
const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
});

export const uploadHeaders = { "Content-Type": VIDEO_CONTENT_TYPE, "If-None-Match": "*" } as const;

export async function signVideoUpload(key: string) {
  try {
    return await getSignedUrl(s3, new PutObjectCommand({
      Bucket: bucket, Key: key,
      ContentType: uploadHeaders["Content-Type"],
      // A still-valid URL cannot overwrite a lecture that has already been confirmed.
      IfNoneMatch: uploadHeaders["If-None-Match"],
    }), { expiresIn: 900, signableHeaders: new Set(["content-type", "if-none-match"]) });
  } catch {
    throw new AppError(503, ERROR_CODE.UPSTREAM_FAILED, "Could not prepare the video upload.");
  }
}

export async function videoObjectExists(key: string) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(10_000) });
    return true;
  } catch (error) {
    if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return false;
    throw new AppError(503, ERROR_CODE.UPSTREAM_FAILED, "Could not verify the video upload.");
  }
}
