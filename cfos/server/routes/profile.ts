import { Router } from "express";
import { getProfile, updateProfile, getCurrencyRates, saveDriveConfig, backupToDrive, getTransactions, resetProfile } from "../controllers/profile.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticateToken, getProfile);
router.post("/", authenticateToken, updateProfile);
router.get("/rates", authenticateToken, getCurrencyRates);
router.get("/transactions", authenticateToken, getTransactions);
router.post("/reset", authenticateToken, resetProfile);
router.post("/drive-config", authenticateToken, saveDriveConfig);
router.post("/drive-backup", authenticateToken, backupToDrive);

export default router;
