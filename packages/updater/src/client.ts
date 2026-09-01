import {
  productIdentitySchema,
  updateJobSchema,
  updatePreflightSchema,
  updateSystemStatusSchema,
  type ProductIdentity,
  type UpdateApplyInput,
  type UpdateJob,
  type UpdatePreflight,
  type UpdateRollbackInput,
  type UpdateSystemStatus
} from "@forgetbase/schema";

export interface UpdateControlService {
  status(): Promise<UpdateSystemStatus>;
  identity(): Promise<ProductIdentity>;
  check(): Promise<UpdateSystemStatus>;
  preflight(version?: string): Promise<UpdatePreflight>;
  apply(input: UpdateApplyInput): Promise<UpdateJob>;
  cancel(jobId: string): Promise<UpdateJob>;
  rollback(input: UpdateRollbackInput): Promise<UpdateJob>;
}

export class HttpUpdateControlClient implements UpdateControlService {
  private readonly baseUrl: URL;

  constructor(
    baseUrl: string,
    private readonly apiToken: string,
    private readonly fetchImplementation: typeof fetch = fetch,
    options: { allowInsecureHttp?: boolean } = {}
  ) {
    if (Buffer.byteLength(apiToken, "utf8") < 32) throw new Error("Updater API token must contain at least 32 bytes");
    this.baseUrl = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    if (!new Set(["http:", "https:"]).has(this.baseUrl.protocol)) throw new Error("Updater URL must use HTTP or HTTPS");
    if (this.baseUrl.username || this.baseUrl.password) throw new Error("Updater URL must not contain credentials");
    if (this.baseUrl.protocol === "http:" && options.allowInsecureHttp !== true) {
      throw new Error("Plain HTTP updater transport requires an explicit trusted-host override");
    }
  }

  async status(): Promise<UpdateSystemStatus> {
    return updateSystemStatusSchema.parse(await this.request("v1/status"));
  }

  async identity(): Promise<ProductIdentity> {
    return productIdentitySchema.parse((await this.status()).identity);
  }

  async check(): Promise<UpdateSystemStatus> {
    return updateSystemStatusSchema.parse(await this.request("v1/check", { method: "POST" }));
  }

  async preflight(version?: string): Promise<UpdatePreflight> {
    return updatePreflightSchema.parse(await this.request("v1/preflight", {
      method: "POST",
      body: JSON.stringify(version ? { version } : {})
    }));
  }

  async apply(input: UpdateApplyInput): Promise<UpdateJob> {
    return updateJobSchema.parse(await this.request("v1/jobs", { method: "POST", body: JSON.stringify(input) }));
  }

  async cancel(jobId: string): Promise<UpdateJob> {
    if (!/^[A-Za-z0-9_-]+$/.test(jobId)) throw new Error("Invalid update job ID");
    return updateJobSchema.parse(await this.request(`v1/jobs/${jobId}/cancel`, { method: "POST" }));
  }

  async rollback(input: UpdateRollbackInput): Promise<UpdateJob> {
    return updateJobSchema.parse(await this.request("v1/rollback", { method: "POST", body: JSON.stringify(input) }));
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetchImplementation(new URL(path, this.baseUrl), {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.apiToken}`,
        ...(init.body ? { "content-type": "application/json" } : {})
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000)
    });
    const text = (await response.text()).slice(0, 256 * 1024);
    if (!response.ok) throw new Error(`Updater returned HTTP ${response.status}: ${text}`);

    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Updater returned invalid JSON");
    }
  }
}
