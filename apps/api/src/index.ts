import { buildServer } from "./server.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";

const server = buildServer();
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  server.log.info({ signal }, "ForgetBase API shutting down");

  try {
    await server.close();
    server.log.info({ signal }, "ForgetBase API shutdown complete");
  } catch (error) {
    server.log.error(error, "ForgetBase API shutdown failed");
    process.exitCode = 1;
  }
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

try {
  const address = await server.listen({ port, host });
  server.log.info({ address }, "ForgetBase API listening");
} catch (error) {
  server.log.error(error, "Failed to start ForgetBase API");
  process.exitCode = 1;
}
