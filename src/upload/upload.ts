import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Documents (Aadhar/PAN/license/etc.) are saved as real files on disk instead
// of base64-encoded inside Postgres rows, to keep the database small. Files
// live under <project root>/uploads, served statically at /uploads/* (see
// server.ts), and are named with a random suffix so two uploads of the same
// filename never collide.
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const moduleName = req.params.module || "vehicles";

    const uploadDir = path.join(
      process.cwd(),
      "uploads",
      moduleName
    );

    fs.mkdirSync(uploadDir, { recursive: true });

    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);

    cb(
      null,
      unique + path.extname(file.originalname)
    );
  },
});

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB per file (2026-09-04, raised from 25MB)
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  }
});

export default upload;
