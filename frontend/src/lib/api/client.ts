import type { ApiFailure } from "@academy/shared";

export class ApiError extends Error {
  constructor(readonly failure: ApiFailure["error"]) {
    super(failure.message);
  }
}

export async function apiRequest<T>(
  path: string,
  token?: string,
  { signal, body, method = body ? "PATCH" : "GET" }: {
    signal?: AbortSignal; body?: object; method?: "GET" | "POST" | "PATCH" | "PUT";
  } = {},
): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) throw new Error("The academy API is unavailable.");

  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body) headers.set("Content-Type", "application/json");
  const response = await fetch(new URL(`/api/v1${path}`, baseUrl), {
    method,
    headers,
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
