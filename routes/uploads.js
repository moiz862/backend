import express from 'express';
import { uploadFile, uploadMultipleFiles, deleteFile } from '../controllers/uploads.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/', protect, uploadFile);
router.post('/multiple', protect, uploadMultipleFiles);
router.delete('/', protect, deleteFile);

export default router;