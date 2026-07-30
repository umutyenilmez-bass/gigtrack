import express from "express";
import cors from "cors";
import { gdriveSyncMiddleware } from "./middleware/gdriveSync.js";
import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import importRoutes from "./routes/import.js";
import chatRoutes from "./routes/chat.js";

const app = express();
app.set('trust proxy', true);

app.use(cors());
app.use(express.json());

// Google Drive Sync Middleware — Mount BEFORE any api route handlers!
app.use(gdriveSyncMiddleware);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/upload", importRoutes);
app.use("/api/chat", chatRoutes);

export default app;
