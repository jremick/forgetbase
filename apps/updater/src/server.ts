import { timingSafeEqual } from "node:crypto";
import fastify, { type FastifyInstance } from "fastify";
import {
  updateApplyInputSchema,
  updateRollbackInputSchema,
  type UpdateApplyInput,
  type UpdateRollbackInput
} from "@forgetbase/schema";
import type { UpdateManager } from "@forgetbase/updater";

export interface BuildUpdaterServerOptions {
  manager: UpdateManager;
  apiToken: string;
  logger?: boolean;
}

export function buildUpdaterServer(options: BuildUpdaterServerOptions): FastifyInstance {
  if (Buffer.byteLength(options.apiToken, "utf8") < 32) {
    throw new Error("FORGETBASE_UPDATER_API_TOKEN must contain at least 32 bytes");
  }

  const server = fastify({ logger: options.logger ?? true, bodyLimit: 64 * 1024 });

  server.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/v1/")) return;
    const authorization = request.headers.authorization;
    const supplied = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

    if (!safeTokenEqual(supplied, options.apiToken)) {
      return reply.code(401).send({ error: "authentication_required" });
    }
  });

  server.get("/health", async () => ({ status: "ok", service: "forgetbase-updater", protocolVersion: "1" }));
  server.get("/v1/status", async () => options.manager.status());
  server.post("/v1/check", async () => options.manager.checkForUpdates());
  server.post<{ Body: { version?: string } }>("/v1/preflight", async (request) =>
    options.manager.preflight(request.body?.version)
  );
  server.post<{ Body: UpdateApplyInput }>("/v1/jobs", async (request, reply) => {
    const job = await options.manager.apply(updateApplyInputSchema.parse(request.body));
    return reply.code(202).send(job);
  });
  server.post<{ Params: { jobId: string } }>("/v1/jobs/:jobId/cancel", async (request) =>
    options.manager.cancel(request.params.jobId)
  );
  server.post<{ Body: UpdateRollbackInput }>("/v1/rollback", async (request, reply) => {
    const job = await options.manager.rollback(updateRollbackInputSchema.parse(request.body));
    return reply.code(202).send(job);
  });

  server.setErrorHandler((error, _request, reply) => {
    server.log.error({ err: error, code: "updater_request_failed" }, "Updater request failed");
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "Error";
    const statusCode = /preflight|active|unavailable|confirmation|managed installation|scheduledFor/i.test(message)
      ? 409
      : name === "ZodError" ? 400 : 500;
    return reply.code(statusCode).send({ error: "updater_request_failed", message });
  });

  return server;
}

function safeTokenEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
