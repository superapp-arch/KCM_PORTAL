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
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB per file
});

export default upload;
