import { Router } from "express";
import { getHistory, clearHistory, postChat } from "../controllers/chat.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.get("/history", authenticateToken, getHistory);
router.delete("/history", authenticateToken, clearHistory);
router.post("/", authenticateToken, postChat);

export default router;
