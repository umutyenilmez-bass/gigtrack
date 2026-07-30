import app from "./app.js";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = createServer(app);

const staticPath =
  process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "public")
    : path.resolve(__dirname, "..", "dist", "public");

app.use(express.static(staticPath));

app.get("*", (_req, res) => {
  res.sendFile(path.join(staticPath, "index.html"));
});

const defaultPort = parseInt(process.env.PORT || '5000', 10);

function startServer(p: number) {
  server.listen(p, () => {
    console.log(`CfOS Server running on http://localhost:${p}/`);
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${p} is in use, trying port ${p + 1}...`);
      startServer(p + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(defaultPort);
