import multer from "multer";

export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Yalnızca PDF dosyaları yüklenebilir."));
    }
  },
});
