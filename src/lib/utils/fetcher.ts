import type { ApiResponse } from "@/types/api";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Typed fetch that unwraps the API envelope — the only fetch the client uses. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  let body: ApiResponse<T>;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiRequestError(`Request failed (${res.status})`, res.status);
  }

  if (!body.success) {
    throw new ApiRequestError(body.error.message, res.status, body.error.code);
  }
  return body.data;
}
