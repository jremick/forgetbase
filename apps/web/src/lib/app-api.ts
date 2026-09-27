const csrfCookieName = "forgetbase_csrf";
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type AppRequest = <T>(path: string, init?: RequestInit, authKey?: string) => Promise<T>;
export type AppBinaryRequest = (path: string, init?: RequestInit, authKey?: string) => Promise<Response>;

export function shouldProbeAuthenticatedSession(apiKey: string, sessionCookieActive: boolean): boolean {
  return Boolean(apiKey) || sessionCookieActive;
}

function readCookie(name: string): string {
  const prefix = `${name}=`;
  const cookie = document.cookie.split("; ").find((candidate) => candidate.startsWith(prefix));

  if (!cookie) {
    return "";
  }

  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return "";
  }
}

export function createAppRequest(getApiUrl: () => string, getApiKey: () => string): AppRequest {
  return async function request<T>(path: string, init: RequestInit = {}, authKey = getApiKey()): Promise<T> {
    const apiUrl = getApiUrl();
    const headers = new Headers(init.headers);
    headers.set("x-forgetbase-surface", "web");

    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    if (authKey) {
      headers.set("authorization", `Bearer ${authKey}`);
    } else if (unsafeMethods.has((init.method ?? "GET").toUpperCase())) {
      const csrfToken = readCookie(csrfCookieName);

      if (csrfToken) {
        headers.set("x-forgetbase-csrf", csrfToken);
      }
    }

    let response: Response;

    try {
      response = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
        ...init,
        headers,
        credentials: init.credentials ?? "include"
      });
    } catch (fetchError) {
      throw new Error(`API request failed for ${apiUrl}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
    }

    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      throw new Error(`Expected JSON from API at ${apiUrl}; received ${contentType || "unknown content type"}`);
    }

    return response.json() as Promise<T>;
  };
}

export function createAppBinaryRequest(getApiUrl: () => string, getApiKey: () => string): AppBinaryRequest {
  return async function requestBinary(path: string, init: RequestInit = {}, authKey = getApiKey()): Promise<Response> {
    const apiUrl = getApiUrl();
    const headers = new Headers(init.headers);
    headers.set("x-forgetbase-surface", "web");

    if (authKey) {
      headers.set("authorization", `Bearer ${authKey}`);
    } else if (unsafeMethods.has((init.method ?? "GET").toUpperCase())) {
      const csrfToken = readCookie(csrfCookieName);

      if (csrfToken) {
        headers.set("x-forgetbase-csrf", csrfToken);
      }
    }

    let response: Response;

    try {
      response = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
        ...init,
        headers,
        credentials: init.credentials ?? "include"
      });
    } catch (fetchError) {
      throw new Error(`API request failed for ${apiUrl}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
    }

    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }

    return response;
  };
}
