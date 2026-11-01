import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-ignore Node-only middleware lives outside the browser TypeScript project.
import { researchBackendPlugin } from "./tools/researchBackend.mjs";
// @ts-ignore Node-only local gateway.
import { mt5BridgePlugin } from "./tools/mt5BridgeProxy.mjs";

// MORPHEUS · MFE X-Ray Lab — standalone owner-private cockpit.
// Single entry (index.html). Relative base so the build can be served from any path.
export default defineConfig({
  base: "./",
  plugins: [react(), mt5BridgePlugin(), researchBackendPlugin()],
  // Historical files stay in public/data and are served there by productServer.
  // Copying them into dist duplicates large private archives without serving a purpose.
  build: { outDir: "dist", emptyOutDir: true, copyPublicDir: false },
  // Local source development. The same-origin MT5 proxy never exposes terminal credentials.
  server: { port: 5190, host: "127.0.0.1", strictPort: true, cors: false },
});
