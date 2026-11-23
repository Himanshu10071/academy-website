import { VIDEO_CONTENT_TYPE } from "@academy/shared";
import { expect, it, vi } from "vitest";

import { signVideoUpload, uploadHeaders } from "./s3.ts";

vi.mock("../config/env.ts", () => ({
  env: { AWS_REGION: "ap-south-1", S3_BUCKET: "academy-test-bucket", AWS_ACCESS_KEY_ID: "fake-key", AWS_SECRET_ACCESS_KEY: "fake-secret" },
}));

it("presigns MP4 PUTs for 15 minutes and signs both required headers", async () => {
  const key = "lectures/test-course/test-lecture.mp4";
  const url = new URL(await signVideoUpload(key));
  expect(url.pathname).toBe(`/${key}`);
  expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
  expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual(expect.arrayContaining(["content-type", "if-none-match"]));
  expect(uploadHeaders).toEqual({ "Content-Type": VIDEO_CONTENT_TYPE, "If-None-Match": "*" });
});
