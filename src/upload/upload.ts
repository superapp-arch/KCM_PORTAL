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
// 2026-09-21 security hardening: `:module` (req.params.module) is also
// validated in server.ts's own route handler (a clean 400 before this even
// runs), but that check lives one file away - re-validated here too, at the
// actual point the value gets written into a filesystem path, so this
// module can never be used unsafely even if some future/other caller wires
// it up differently. A value that isn't a plain word (letters/digits/-/_)
// - most notably ".." on its own, a perfectly valid single URL path
// segment - used to flow straight into path.join(uploadsDir, moduleName),
// which can resolve OUTSIDE the intended uploads directory entirely
// (classic path traversal). Every real module name already in use already
// matches this shape.
function sanitizeModuleName(raw: string | undefined): string {
  return raw && /^[a-zA-Z0-9_-]+$/.test(raw) ? raw : 'vehicles';
}

// Maps each allowed MIME type to a fixed, safe extension - the on-disk file
// name NEVER trusts the client-supplied original filename's own extension,
// which used to be taken as-is (path.extname(file.originalname)). A MIME
// type is technically still client-declared (spoofable), but at minimum
// this guarantees an uploaded file can never land on disk as, say, `.html`/
// `.svg`/`.js` - which a browser could otherwise be tricked into rendering/
// executing if someone was ever given a direct link into /uploads - no
// matter what extension the original filename actually claimed.
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const moduleName = sanitizeModuleName(req.params.module);

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
    const ext = EXTENSION_BY_MIME_TYPE[file.mimetype] || '.bin';

    cb(
      null,
      unique + ext
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
