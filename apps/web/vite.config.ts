import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const allowedHosts = (process.env.FORGETBASE_WEB_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  },
  preview: allowedHosts.length ? { allowedHosts } : undefined,
  server: {
    port: 5173
  }
});
