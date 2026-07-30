import { Router } from "express";
import { uploadStatement, getDrafts, finalizeDrafts } from "../controllers/import.js";
import { authenticateToken } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { dbContext } from "../db.js";

const router = Router();

router.post(
  "/",
  authenticateToken,
  (req, res, next) => {
    const activeDb = dbContext.getStore();
    upload.single("statement")(req, res, (err) => {
      if (err) return next(err);
      if (activeDb) {
        dbContext.run(activeDb, () => {
          next();
        });
      } else {
        next();
      }
    });
  },
  uploadStatement
);

router.get("/drafts", authenticateToken, getDrafts);
router.post("/finalize", authenticateToken, finalizeDrafts);

export default router;
