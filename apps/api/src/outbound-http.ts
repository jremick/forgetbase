import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type TcpSocketConnectOpts } from "node:net";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://api.openai.com",
  "https://api.anthropic.com",
  "https://openrouter.ai",
  "https://login.microsoftonline.com"
] as const;

const NON_PUBLIC_IPV4_CIDRS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
] as const;

const NON_PUBLIC_IPV6_CIDRS = [
  ["::", 96],
  ["::ffff:0:0", 96],
  ["::ffff:0:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8]
] as const;

const nonPublicIpv4 = new BlockList();
const nonPublicIpv6 = new BlockList();
const publicIpv6Addresses = new BlockList();
publicIpv6Addresses.addSubnet("2000::", 3, "ipv6");
for (const [network, prefix] of NON_PUBLIC_IPV4_CIDRS) {
  nonPublicIpv4.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of NON_PUBLIC_IPV6_CIDRS) {
  nonPublicIpv6.addSubnet(network, prefix, "ipv6");
}

export interface ResolvedOutboundAddress {
  address: string;
  family: 4 | 6;
}

export interface ResolvedOutboundDestination {
  url: URL;
  addresses: readonly ResolvedOutboundAddress[];
}

export interface OutboundHttpRequestInit {
  method?: string;
  headers?: HeadersInit;
  body?: string | Uint8Array;
  timeoutMs: number;
  maxResponseBytes: number;
}

export interface OutboundHttpClient {
  assertDestination(value: string | URL, timeoutMs?: number): Promise<URL>;
  request(value: string | URL, init: OutboundHttpRequestInit): Promise<Response>;
}

export type OutboundHostnameResolver = (hostname: string) => Promise<readonly ResolvedOutboundAddress[]>;
export type OutboundHttpTransport = (
  destination: ResolvedOutboundDestination,
  init: OutboundHttpRequestInit,
  signal: AbortSignal
) => Promise<Response>;

export interface OutboundHttpClientOptions {
  allowedOrigins?: readonly string[];
  developmentAllowPrivateNetwork?: boolean;
  includeDefaultAllowedOrigins?: boolean;
  resolveHostname?: OutboundHostnameResolver;
  transport?: OutboundHttpTransport;
}

export class OutboundDestinationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "OutboundDestinationError";
  }
}

export function createOutboundHttpClient(options: OutboundHttpClientOptions = {}): OutboundHttpClient {
  const developmentAllowPrivateNetwork = options.developmentAllowPrivateNetwork ?? false;
  const allowedOrigins = new Set<string>();

  if (options.includeDefaultAllowedOrigins !== false) {
    for (const origin of DEFAULT_ALLOWED_ORIGINS) allowedOrigins.add(origin);
  }
  for (const origin of options.allowedOrigins ?? []) {
    allowedOrigins.add(parseAllowedOrigin(origin, developmentAllowPrivateNetwork));
  }

  const resolveHostname = options.resolveHostname ?? resolveAllAddresses;
  const transport = options.transport ?? requestPinnedDestination;

  async function resolveDestination(value: string | URL): Promise<ResolvedOutboundDestination> {
    const url = parseOutboundUrl(value, developmentAllowPrivateNetwork);
    const originApproved = allowedOrigins.has(url.origin);

    if (!originApproved && !developmentAllowPrivateNetwork) {
      throw new OutboundDestinationError("outbound_origin_not_allowed");
    }

    const hostname = unbracketHostname(url.hostname);
    const literalFamily = isIP(hostname);
    let addresses: readonly ResolvedOutboundAddress[];

    if (literalFamily === 4 || literalFamily === 6) {
      addresses = [{ address: hostname, family: literalFamily }];
    } else {
      try {
        addresses = deduplicateAddresses(await resolveHostname(hostname));
      } catch {
        throw new OutboundDestinationError("outbound_dns_resolution_failed");
      }
    }

    if (addresses.length === 0 || addresses.some((address) => address.family !== isIP(address.address))) {
      throw new OutboundDestinationError("outbound_dns_resolution_failed");
    }

    const publicCount = addresses.filter(({ address }) => isPublicAddress(address)).length;
    if (publicCount !== addresses.length && !developmentAllowPrivateNetwork) {
      throw new OutboundDestinationError("outbound_non_public_address");
    }

    if (!originApproved && publicCount > 0) {
      throw new OutboundDestinationError("outbound_origin_not_allowed");
    }

    return { url, addresses };
  }

  return {
    async assertDestination(value, timeoutMs = 10_000) {
      return (await withOutboundDeadline(timeoutMs, () => resolveDestination(value))).url;
    },
    async request(value, init) {
      return withOutboundDeadline(init.timeoutMs, async (signal) => {
        const destination = await resolveDestination(value);
        // System DNS may complete after the caller's deadline.
        signal.throwIfAborted();
        return transport(destination, init, signal);
      });
    }
  };
}

async function withOutboundDeadline<T>(timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new OutboundDestinationError("outbound_timeout_invalid");
  }
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new OutboundDestinationError("outbound_request_timeout");
      reject(error);
      controller.abort(error);
    }, timeoutMs);
    timer.unref();
  });
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export function createOutboundHttpClientFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): OutboundHttpClient {
  const configuredOrigins = (environment.FORGETBASE_OUTBOUND_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const developmentAllowPrivateNetwork = readBooleanEnvironmentOption(
    environment.FORGETBASE_OUTBOUND_DEVELOPMENT_ALLOW_PRIVATE,
    "FORGETBASE_OUTBOUND_DEVELOPMENT_ALLOW_PRIVATE"
  );

  return createOutboundHttpClient({
    allowedOrigins: configuredOrigins,
    developmentAllowPrivateNetwork
  });
}

export function isPublicAddress(address: string): boolean {
  const addressWithoutZone = address.split("%", 1)[0] ?? address;
  const family = isIP(addressWithoutZone);

  if (family === 4) return !nonPublicIpv4.check(addressWithoutZone, "ipv4");
  if (family === 6) {
    return publicIpv6Addresses.check(addressWithoutZone, "ipv6") &&
      !nonPublicIpv6.check(addressWithoutZone, "ipv6");
  }
  return false;
}

function parseAllowedOrigin(value: string, developmentAllowPrivateNetwork: boolean): string {
  const url = parseOutboundUrl(value, developmentAllowPrivateNetwork);

  if (url.hostname.includes("*") || url.pathname !== "/" || url.search || url.hash) {
    throw new OutboundDestinationError("outbound_allowed_origin_invalid");
  }

  return url.origin;
}

function parseOutboundUrl(value: string | URL, developmentAllowPrivateNetwork: boolean): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new OutboundDestinationError("outbound_url_invalid");
  }

  const permittedProtocol = url.protocol === "https:" ||
    (developmentAllowPrivateNetwork && url.protocol === "http:");

  if (!permittedProtocol) {
    throw new OutboundDestinationError("outbound_https_required");
  }

  if (url.username || url.password || url.hash) {
    throw new OutboundDestinationError("outbound_url_credentials_or_fragment");
  }

  return url;
}

async function resolveAllAddresses(hostname: string): Promise<readonly ResolvedOutboundAddress[]> {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  return addresses.flatMap((address) =>
    address.family === 4 || address.family === 6
      ? [{ address: address.address, family: address.family }]
      : []
  );
}

function deduplicateAddresses(addresses: readonly ResolvedOutboundAddress[]): readonly ResolvedOutboundAddress[] {
  const seen = new Set<string>();
  const result: ResolvedOutboundAddress[] = [];

  for (const address of addresses) {
    const key = `${address.family}:${address.address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(address);
  }

  return result;
}

function unbracketHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function readBooleanEnvironmentOption(value: string | undefined, name: string): boolean {
  if (value === undefined || value.trim() === "" || value.trim().toLowerCase() === "false") return false;
  if (value.trim().toLowerCase() === "true") return true;
  throw new Error(`${name} must be true or false`);
}

async function requestPinnedDestination(
  destination: ResolvedOutboundDestination,
  init: OutboundHttpRequestInit,
  signal: AbortSignal
): Promise<Response> {
  if (!Number.isSafeInteger(init.maxResponseBytes) || init.maxResponseBytes <= 0) {
    throw new OutboundDestinationError("outbound_response_limit_invalid");
  }

  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, key) => {
    headers[key] = value;
  });

  const requestOptions: RequestOptions & Pick<TcpSocketConnectOpts, "autoSelectFamily"> = {
    agent: false,
    autoSelectFamily: true,
    signal,
    method: init.method ?? "GET",
    headers,
    lookup(_hostname, options, callback) {
      // Node selects a connected socket before sending this single HTTP request.
      if (options.all) {
        callback(null, [...destination.addresses]);
      } else {
        const first = destination.addresses[0];
        if (first) callback(null, first.address, first.family);
        else callback(new OutboundDestinationError("outbound_dns_resolution_failed"), []);
      }
    }
  };
  const requestImplementation = destination.url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise<Response>((resolve, reject) => {
    const request = requestImplementation(destination.url, requestOptions, (response) => {
      const chunks: Buffer[] = [];
      let receivedBytes = 0;

      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        receivedBytes += buffer.byteLength;

        if (receivedBytes > init.maxResponseBytes) {
          const error = new OutboundDestinationError("outbound_response_too_large");
          response.destroy(error);
          reject(error);
          return;
        }

        chunks.push(buffer);
      });
      response.on("end", () => {
        try {
          const body = receivedBytes > 0 ? new Uint8Array(Buffer.concat(chunks)) : null;
          resolve(new Response(body, { status: response.statusCode, headers: responseHeaders(response.headers) }));
        } catch {
          reject(new OutboundDestinationError("outbound_response_invalid"));
        }
      });
      response.on("error", reject);
    });
    request.on("error", reject);

    if (init.body !== undefined) request.write(init.body);
    request.end();
  });
}

function responseHeaders(input: IncomingHttpHeaders): Headers {
  const headers = new Headers();

  for (const [name, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  return headers;
}
