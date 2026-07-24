import multer from "multer";
import fs from "fs";
import path from "path";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const module = (req.body.module || "misc").toLowerCase();
    const vehicle = req.body.vehicle || "general";

    const uploadPath = path.join(
      process.cwd(),
      "uploads",
      module,
      vehicle
    );

    fs.mkdirSync(uploadPath, { recursive: true });

    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const timestamp = Date.now();

    const extension = path.extname(file.originalname);

    const filename =
      timestamp + "-" + file.originalname.replace(/\s+/g, "_");

    cb(null, filename);
  },
});

export const upload = multer({
  storage,

  limits: {
    fileSize: 100 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/jpg",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type"));
    }
  },
});
