import { expect, it, vi } from "vitest";
import { getPlaybackUrl } from "./video-signer.ts";

vi.mock("../config/env.ts", () => ({ env: {
  S3_BUCKET: "academy-playback-test", AWS_REGION: "us-east-1",
  AWS_ACCESS_KEY_ID: "fixture-key", AWS_SECRET_ACCESS_KEY: "fixture-secret",
} }));

it("presigns a GET for the requested lifetime and requires a fresh read after expiry", async () => {
  const url = new URL(await getPlaybackUrl("lectures/test/video.mp4", 900));
  expect(url.pathname).toBe("/lectures/test/video.mp4");
  expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
  expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
  expect(url.searchParams.get("response-cache-control")).toBe("private, no-store");
});
