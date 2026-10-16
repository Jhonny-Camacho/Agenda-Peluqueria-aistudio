import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";
import app from "./artifacts/api-server/src/app";
import { seedSalonData } from "./artifacts/api-server/src/lib/seedSalon";
import { logger } from "./artifacts/api-server/src/lib/logger";

const port = 3000;
const isProd = process.env.NODE_ENV === "production";
const clientRoot = path.resolve(process.cwd(), "artifacts/agenda-peluqueria");

async function startServer() {
  try {
    await seedSalonData();
  } catch (err) {
    logger.warn({ err }, "Initial database seeding was skipped or encountered an error");
  }

  if (!isProd) {
    const vite = await createViteServer({
      root: clientRoot,
      server: {
        middlewareMode: true,
        host: "0.0.0.0",
        port,
      },
      appType: "spa",
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(clientRoot, "dist/public");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(port, "0.0.0.0", () => {
    logger.info({ port, env: process.env.NODE_ENV || "development" }, `Salon application server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal error starting salon server:", err);
  process.exit(1);
});
