import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";

// A small Vite middleware that proxies POST /api/chat to Anthropic.
// Uses ANTHROPIC_API_KEY from the environment so the key never reaches the browser.
function claudeProxyPlugin() {
  return {
    name: "claude-proxy",
    configureServer(server: any) {
      server.middlewares.use(
        "/api/chat",
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end("Method Not Allowed");
            return;
          }
          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(
              JSON.stringify({
                error:
                  "ANTHROPIC_API_KEY is not set. Add it to your shell or a .env file before starting the dev server.",
              }),
            );
            return;
          }
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));

            const upstream = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: body.model ?? "claude-sonnet-4-6",
                max_tokens: body.max_tokens ?? 1024,
                system: body.system,
                messages: body.messages,
              }),
            });
            const text = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader("content-type", "application/json");
            res.end(text);
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: String(err) }));
          }
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), claudeProxyPlugin()],
  server: { port: 5173, host: true },
});
