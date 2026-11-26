import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  createOutboundHttpClient,
  isPublicAddress,
  type ResolvedOutboundAddress,
  type ResolvedOutboundDestination
} from "./outbound-http.js";

describe("outbound HTTP destination policy", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:0:127.0.0.1",
    "64:ff9b::7f00:1",
    "2001:db8::1",
    "3fff::1",
    "4000::1",
    "5f00::1",
    "fc00::1",
    "fe80::1",
    "ff02::1"
  ])("classifies non-public address %s as blocked", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "2001:4860:4860::8888"])(
    "classifies public address %s as allowed",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    }
  );

  it("rejects an approved hostname when any resolved address is non-public", async () => {
    let transported = false;
    const client = createOutboundHttpClient({
      includeDefaultAllowedOrigins: false,
      allowedOrigins: ["https://provider.example.test"],
      resolveHostname: async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "10.0.0.8", family: 4 }
      ],
      transport: async () => {
        transported = true;
        return Response.json({ ok: true });
      }
    });

    await expect(client.request("https://provider.example.test/v1/messages", {
      timeoutMs: 1_000,
      maxResponseBytes: 1_024
    })).rejects.toMatchObject({ code: "outbound_non_public_address" });
    expect(transported).toBe(false);
  });

  it.each([
    "https://127.0.0.1/model",
    "https://2130706433/model",
    "https://0x7f000001/model",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/model",
    "https://[::ffff:127.0.0.1]/model"
  ])("rejects an approved non-public literal form: %s", async (url) => {
    const client = createOutboundHttpClient({
      includeDefaultAllowedOrigins: false,
      allowedOrigins: [new URL(url).origin]
    });

    await expect(client.assertDestination(url)).rejects.toMatchObject({
      code: "outbound_non_public_address"
    });
  });

  it("passes every approved public resolution to the pinned transport", async () => {
    let destination: ResolvedOutboundDestination | undefined;
    const client = createOutboundHttpClient({
      includeDefaultAllowedOrigins: false,
      allowedOrigins: ["https://provider.example.test"],
      resolveHostname: async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "2606:4700:4700::1111", family: 6 }
      ],
      transport: async (resolved) => {
        destination = resolved;
        return Response.json({ ok: true });
      }
    });

    const response = await client.request("https://provider.example.test/v1/messages", {
      method: "POST",
      body: "{}",
      timeoutMs: 1_000,
      maxResponseBytes: 1_024
    });

    expect(response.ok).toBe(true);
    expect(destination?.url.origin).toBe("https://provider.example.test");
    expect(destination?.addresses).toEqual([
      { address: "8.8.8.8", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 }
    ]);
  });

  it.each([
    "https://api.openai.com/v1/responses",
    "https://api.anthropic.com/v1/messages",
    "https://openrouter.ai/api/v1/chat/completions",
    "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration"
  ])("preserves a built-in provider destination: %s", async (url) => {
    const client = createOutboundHttpClient({
      resolveHostname: async () => [{ address: "8.8.8.8", family: 4 }],
      transport: async () => Response.json({ ok: true })
    });

    await expect(client.request(url, {
      timeoutMs: 1_000,
      maxResponseBytes: 1_024
    })).resolves.toMatchObject({ ok: true });
  });

  it("rejects public origins that the deployment did not approve", async () => {
    const client = createOutboundHttpClient({
      includeDefaultAllowedOrigins: false,
      resolveHostname: async () => [{ address: "8.8.8.8", family: 4 }]
    });

    await expect(client.assertDestination("https://unapproved.example.test/path")).rejects.toMatchObject({
      code: "outbound_origin_not_allowed"
    });
  });

  it("requires origin approval for mixed public and private DNS results in development", async () => {
    const client = createOutboundHttpClient({
      developmentAllowPrivateNetwork: true,
      resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }, { address: "1.1.1.1", family: 4 }]
    });
    await expect(client.assertDestination("https://mixed.example.test")).rejects.toMatchObject({
      code: "outbound_origin_not_allowed"
    });
  });

  it("bounds DNS checks and never opens a connection after the request deadline", async () => {
    vi.useFakeTimers();
    try {
      let completeLookup!: (addresses: ResolvedOutboundAddress[]) => void;
      const lookup = new Promise<ResolvedOutboundAddress[]>((resolve) => { completeLookup = resolve; });
      const transport = vi.fn(async () => Response.json({ ok: true }));
      const client = createOutboundHttpClient({ resolveHostname: () => lookup, transport });
      const url = "https://api.openai.com/v1/responses";
      const checked = expect(client.assertDestination(url, 100)).rejects.toMatchObject({ code: "outbound_request_timeout" });
      const requested = expect(client.request(url, { timeoutMs: 100, maxResponseBytes: 1024 }))
        .rejects.toMatchObject({ code: "outbound_request_timeout" });
      await vi.advanceTimersByTimeAsync(100);
      await Promise.all([checked, requested]);
      completeLookup([{ address: "1.1.1.1", family: 4 }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(transport).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to a validated IPv4 address before sending a POST once", async () => {
    const received: string[] = [];
    const fixture = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk);
      received.push(Buffer.concat(chunks).toString());
      response.end(request.headers.host);
    });
    try {
      await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
      const address = fixture.address();
      if (!address || typeof address === "string") throw new Error("Fixture must have a TCP address");
      const resolveHostname = vi.fn(async (): Promise<ResolvedOutboundAddress[]> => [
        { address: "::1", family: 6 }, { address: "127.0.0.1", family: 4 }
      ]);
      const client = createOutboundHttpClient({ developmentAllowPrivateNetwork: true, resolveHostname });
      const host = `provider.example.test:${address.port}`;
      const response = await client.request(`http://${host}/token`, {
        method: "POST", body: "synthetic request", timeoutMs: 2000, maxResponseBytes: 1024
      });
      expect(await response.text()).toBe(host);
      expect(received).toEqual(["synthetic request"]);
      expect(resolveHostname).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve) => fixture.close(() => resolve()));
    }
  });

  it("rejects a transport response that the Response constructor cannot represent", async () => {
    const fixture = createServer((_request, response) => response.end("synthetic fixture"));
    try {
      await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
      const address = fixture.address();
      if (!address || typeof address === "string") throw new Error("Fixture must have a TCP address");
      vi.stubGlobal("Response", class { constructor() { throw new TypeError("Invalid response"); } });
      const client = createOutboundHttpClient({ developmentAllowPrivateNetwork: true });
      await expect(client.request(`http://127.0.0.1:${address.port}`, { timeoutMs: 2000, maxResponseBytes: 1024 }))
        .rejects.toMatchObject({ code: "outbound_response_invalid" });
    } finally {
      vi.unstubAllGlobals();
      await new Promise<void>((resolve) => fixture.close(() => resolve()));
    }
  });

  it("connects using the validated address and retains the original HTTP host", async () => {
    const fixture = createServer((request, response) => response.end(request.headers.host));
    try {
      await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
      const address = fixture.address();
      if (!address || typeof address === "string") throw new Error("Fixture must have a TCP address");
      const client = createOutboundHttpClient({
        developmentAllowPrivateNetwork: true,
        resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }]
      });
      const host = `provider.example.test:${address.port}`;
      const response = await client.request(`http://${host}/health`, { timeoutMs: 2000, maxResponseBytes: 1024 });
      expect(await response.text()).toBe(host);
    } finally {
      await new Promise<void>((resolve) => fixture.close(() => resolve()));
    }
  });

  it("allows an explicit development override to reach a private HTTP fixture", async () => {
    let transported = false;
    const client = createOutboundHttpClient({
      includeDefaultAllowedOrigins: false,
      developmentAllowPrivateNetwork: true,
      resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }],
      transport: async () => {
        transported = true;
        return Response.json({ ok: true });
      }
    });

    const response = await client.request("http://local-provider.example.test:8080/token", {
      timeoutMs: 1_000,
      maxResponseBytes: 1_024
    });

    expect(response.ok).toBe(true);
    expect(transported).toBe(true);
  });
});
