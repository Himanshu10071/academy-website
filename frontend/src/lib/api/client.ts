import type { ApiFailure } from "@academy/shared";

export class ApiError extends Error {
  constructor(readonly failure: ApiFailure["error"]) {
    super(failure.message);
  }
}

export async function apiRequest<T>(
  path: string,
  token: string,
  { signal, body }: { signal?: AbortSignal; body?: object } = {},
): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) throw new Error("The academy API is unavailable.");

  const response = await fetch(new URL(`/api/v1${path}`, baseUrl), {
    method: body ? "PATCH" : "GET",
    headers: body
      ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      : { Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as ApiFailure | null;
    if (failure?.error) throw new ApiError(failure.error);
    throw new Error("The academy API could not complete the request.");
  }
  return response.json() as Promise<T>;
}
