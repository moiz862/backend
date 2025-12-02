import asyncHandler from '../middleware/asyncHandler.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @desc    Upload file
// @route   POST /api/upload
// @access  Private
export const uploadFile = asyncHandler(async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No files were uploaded.'
    });
  }

  const uploadedFile = req.files.file;
  
  // Check file type
  const allowedTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];
  
  if (!allowedTypes.includes(uploadedFile.mimetype)) {
    return res.status(400).json({
      success: false,
      message: 'File type not allowed'
    });
  }

  // Generate unique filename
  const fileExtension = path.extname(uploadedFile.name);
  const fileName = `file-${Date.now()}${fileExtension}`;
  const uploadPath = path.join(__dirname, '../uploads', fileName);

  // Create uploads directory if it doesn't exist
  const uploadDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Move file to uploads directory
  await uploadedFile.mv(uploadPath);

  res.json({
    success: true,
    data: {
      filename: fileName,
      originalName: uploadedFile.name,
      url: `/uploads/${fileName}`,
      size: uploadedFile.size,
      mimetype: uploadedFile.mimetype
    },
    message: 'File uploaded successfully'
  });
});

// @desc    Upload multiple files
// @route   POST /api/upload/multiple
// @access  Private
export const uploadMultipleFiles = asyncHandler(async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No files were uploaded.'
    });
  }

  const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];
  const uploadDir = path.join(__dirname, '../uploads');
  
  // Create uploads directory if it doesn't exist
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const uploadedFiles = [];

  for (const file of files) {
    const fileExtension = path.extname(file.name);
    const fileName = `file-${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
    const uploadPath = path.join(uploadDir, fileName);
    
    await file.mv(uploadPath);
    
    uploadedFiles.push({
      filename: fileName,
      originalName: file.name,
      url: `/uploads/${fileName}`,
      size: file.size,
      mimetype: file.mimetype
    });
  }

  res.json({
    success: true,
    data: uploadedFiles,
    message: 'Files uploaded successfully'
  });
});

// @desc    Delete file
// @route   DELETE /api/upload
// @access  Private
export const deleteFile = asyncHandler(async (req, res) => {
  const { filename } = req.body;

  if (!filename) {
    return res.status(400).json({
      success: false,
      message: 'Filename is required'
    });
  }

  const filePath = path.join(__dirname, '../uploads', filename);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: 'File not found'
    });
  }

  // Delete file
  fs.unlinkSync(filePath);

  res.json({
    success: true,
    message: 'File deleted successfully'
  });
});