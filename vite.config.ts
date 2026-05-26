import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const productionCsp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self' https://mainnet.zklighter.elliot.ai https://testnet.zklighter.elliot.ai",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "media-src 'none'",
  "manifest-src 'self'"
].join("; ");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "production-csp",
      apply: "build",
      transformIndexHtml(html) {
        return html.replace(
          "<head>",
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${productionCsp}" />`
        );
      }
    }
  ],
  server: {
    port: 5173,
    strictPort: false
  },
  test: {
    environment: "node",
    globals: true
  }
});
