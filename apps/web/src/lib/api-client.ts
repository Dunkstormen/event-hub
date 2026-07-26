import type { ApiErrorResponse } from "@event-hub/contracts";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export class ApiClientError extends Error {
  readonly code: string;
  readonly requestId: string | undefined;
  readonly status: number;

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

async function errorResponse(response: Response) {
  let body: ApiErrorResponse | undefined;

  try {
    body = (await response.json()) as ApiErrorResponse;
  } catch {
    body = undefined;
  }

  throw new ApiClientError(
    response.status,
    body?.error.code ?? "INTERNAL_ERROR",
    body?.error.message ?? "The request could not be completed.",
    body?.error.requestId,
  );
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(new URL(path, apiBaseUrl), {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    await errorResponse(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
