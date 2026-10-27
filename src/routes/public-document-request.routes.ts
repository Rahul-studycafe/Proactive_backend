import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  getPublicDocumentRequest,
  uploadPublicFile
} from '../controllers/document-request.controller';
import { ApiError } from '../common/errors/api-error';

const tempUploadDir = path.join(process.cwd(), 'public', 'uploads', 'temp');
fs.mkdirSync(tempUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `upload-${Date.now()}-${basename}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25 MB max
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const forbiddenExts = ['.exe', '.sh', '.bat', '.cmd', '.msi', '.vbs', '.php'];
    if (forbiddenExts.includes(ext)) {
      return cb(
        new ApiError(
          400,
          `File type "${ext}" is forbidden for security reasons`,
          'FORBIDDEN_FILE_TYPE'
        ) as any
      );
    }
    cb(null, true);
  }
});

const router = Router();

// Public Document Request Resolution (No Auth Required)
router.get('/:token', getPublicDocumentRequest);

// Public Multipart Document Upload (No Auth Required)
router.post('/:token/upload', upload.single('file'), uploadPublicFile);

export default router;
