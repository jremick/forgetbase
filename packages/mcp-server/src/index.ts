import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

const server = createMcpServer({
  apiUrl: process.env.FORGETBASE_API_URL,
  apiKey: process.env.FORGETBASE_API_KEY
});
const transport = new StdioServerTransport();

await server.connect(transport);
