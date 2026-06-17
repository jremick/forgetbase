import { buildServer } from "./server.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";

const server = buildServer();

try {
  const address = await server.listen({ port, host });
  server.log.info({ address }, "Agentic CMS API listening");
} catch (error) {
  server.log.error(error, "Failed to start Agentic CMS API");
  process.exit(1);
}
