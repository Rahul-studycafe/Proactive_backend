import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ApiError } from '../common/errors/api-error';

const fileFilter = (req: any, file: any, cb: any) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'Only images are allowed', 'INVALID_FILE_TYPE'), false);
  }
};

const createUploadMiddleware = (folderName: string) => {
  const uploadDir = path.join(process.cwd(), `public/uploads/${folderName}`);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
  });

  return multer({ 
    storage, 
    fileFilter,
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB limit
    }
  });
};

export const uploadAvatarMiddleware = createUploadMiddleware('avatars');
export const uploadClientMiddleware = createUploadMiddleware('clients');
