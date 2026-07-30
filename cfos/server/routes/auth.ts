import { Router } from "express";
import { register, login, saveKey, googleLogin, googleCallback } from "../controllers/auth.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/key", authenticateToken, saveKey);

// Google OAuth Rotaları
router.get("/google", googleLogin);
router.get("/google/callback", googleCallback);

export default router;
