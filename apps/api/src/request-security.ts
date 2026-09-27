import type { FastifyServerOptions } from "fastify";

export function safeRequestLogger(logger: FastifyServerOptions["logger"] = true): FastifyServerOptions["logger"] {
  if (logger === false) return false;
  const options = typeof logger === "object" ? logger : {};
  return {
    ...options,
    serializers: {
      ...options.serializers,
      req(request) {
        return {
          method: request.method,
          url: request.routeOptions?.url ?? request.url?.split("?")[0],
          remoteAddress: request.ip
        };
      },
      // Exception messages, stacks and causes can contain provider content,
      // connection strings or submitted data. Keep only a bounded error code.
      err(error) {
        return { type: "Error", message: "Error details redacted", stack: "", code: safeErrorCode(error) };
      }
    }
  };
}

export function safeErrorCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return typeof code === "string" && code.length <= 64 && /^(FST_ERR_[A-Z0-9_]+|ERR_[A-Z0-9_]+|[0-9A-Z]{5})$/.test(code)
    ? code : "internal_server_error";
}
