import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const allowedHosts = (process.env.AGENTIC_CMS_WEB_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react()],
  preview: allowedHosts.length ? { allowedHosts } : undefined,
  server: {
    port: 5173
  }
});
