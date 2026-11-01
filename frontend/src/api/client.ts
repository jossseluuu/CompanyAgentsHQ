const BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let csrfToken = "";

export function setCsrf(token: string) {
  csrfToken = token;
}

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["X-CSRF-Token"] = csrfToken;
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  const response = await fetch(BASE + url, {
    method,
    headers,
    credentials: "same-origin",
    body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data?.error ?? { code: "error", message: `Error ${response.status}` };
    throw new ApiError(error.code, error.message, response.status);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => send<T>("GET", url),
  post: <T>(url: string, body?: unknown) => send<T>("POST", url, body),
  patch: <T>(url: string, body: unknown) => send<T>("PATCH", url, body),
  put: <T>(url: string, body: unknown) => send<T>("PUT", url, body),
  del: (url: string) => send<void>("DELETE", url),
  upload: <T>(url: string, file: File, extra: Record<string, string> = {}) => {
    const form = new FormData();
    form.append("file", file);
    Object.entries(extra).forEach(([key, value]) => form.append(key, value));
    return send<T>("POST", url, form);
  },
};

export const fileUrl = (id: string, preview = false) => `${BASE}/files/${id}${preview ? "?preview=true" : ""}`;
