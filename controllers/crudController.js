import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';
import CRUDItem from '../models/CRUDitem.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

git 
// @desc    Get all CRUD items for user
// @route   GET /api/crud
// @access  Private
export const getCRUDItems = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const { tags, search } = req.query;

  let query = { createdBy: req.user.id, isActive: true };

  // Filter by tags
  if (tags) {
    const tagArray = tags.split(',');
    query.tags = { $in: tagArray };
  }

  // Search in title and description
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  const items = await CRUDItem.find(query)
    .populate('createdBy', 'name email')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await CRUDItem.countDocuments(query);

  res.json({
    success: true,
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get single CRUD item
// @route   GET /api/crud/:id
// @access  Private
export const getCRUDItem = asyncHandler(async (req, res) => {
  const item = await CRUDItem.findOne({
    _id: req.params.id,
    createdBy: req.user.id,
    isActive: true
  }).populate('createdBy', 'name email');

  if (!item) {
    return res.status(404).json({
      success: false,
      message: 'CRUD item not found'
    });
  }

  res.json({
    success: true,
    data: item
  });
});

// @desc    Create CRUD item with file uploads
// @route   POST /api/crud
// @access  Private
export const createCRUDItem = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  // Check if user can create more items
  if (!user.canCreateCRUD()) {
    return res.status(400).json({
      success: false,
      message: 'Free tier limit reached. Upgrade to premium to create more items.'
    });
  }

  const { title, description, content, tags } = req.body;

  // Handle file uploads for images
  let images = [];
  if (req.files && req.files.images) {
    const uploadedFiles = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
    
    for (const file of uploadedFiles) {
      // Check file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: 'Only image files are allowed (JPEG, PNG, GIF, WebP)'
        });
      }

      // Check file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum size is 5MB per file'
        });
      }

      // Generate unique filename
      const fileExtension = path.extname(file.name);
      const fileName = `crud-${req.user.id}-${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
      const uploadPath = path.join(__dirname, '../uploads', fileName);

      // Create uploads directory if it doesn't exist
      const uploadDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Move file to uploads directory
      await file.mv(uploadPath);

      images.push({
        url: `/uploads/${fileName}`,
        filename: fileName,
        originalName: file.name
      });
    }
  }

  const item = await CRUDItem.create({
    title,
    description,
    content,
    tags: tags ? tags.split(',') : [],
    images,
    createdBy: req.user.id
  });

  // Increment user's CRUD count
  await User.findByIdAndUpdate(req.user.id, {
    $inc: { crudCount: 1 }
  });

  await item.populate('createdBy', 'name email');

  res.status(201).json({
    success: true,
    data: item,
    message: 'CRUD item created successfully'
  });
});

// @desc    Update CRUD item with file uploads
// @route   PUT /api/crud/:id
// @access  Private
export const updateCRUDItem = asyncHandler(async (req, res) => {
  let item = await CRUDItem.findOne({
    _id: req.params.id,
    createdBy: req.user.id
  });

  if (!item) {
    return res.status(404).json({
      success: false,
      message: 'CRUD item not found'
    });
  }

  const { title, description, content, tags } = req.body;

  // Handle new file uploads for images
  let newImages = [];
  if (req.files && req.files.images) {
    const uploadedFiles = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
    
    for (const file of uploadedFiles) {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: 'Only image files are allowed'
        });
      }

      if (file.size > 5 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum size is 5MB per file'
        });
      }

      const fileExtension = path.extname(file.name);
      const fileName = `crud-${req.user.id}-${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
      const uploadPath = path.join(__dirname, '../uploads', fileName);

      const uploadDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      await file.mv(uploadPath);
      
      newImages.push({
        url: `/uploads/${fileName}`,
        filename: fileName,
        originalName: file.name
      });
    }
  }

  // Combine existing images with new ones
  const updatedImages = [...(item.images || []), ...newImages];

  item = await CRUDItem.findByIdAndUpdate(
    req.params.id,
    {
      title: title || item.title,
      description: description || item.description,
      content: content || item.content,
      tags: tags ? tags.split(',') : item.tags,
      images: updatedImages
    },
    { new: true, runValidators: true }
  ).populate('createdBy', 'name email');

  res.json({
    success: true,
    data: item,
    message: 'CRUD item updated successfully'
  });
});

// @desc    Delete image from CRUD item
// @route   DELETE /api/crud/:id/images
// @access  Private
export const deleteImageFromCRUD = asyncHandler(async (req, res) => {
  const { imageUrl } = req.body;

  const item = await CRUDItem.findOne({
    _id: req.params.id,
    createdBy: req.user.id
  });

  if (!item) {
    return res.status(404).json({
      success: false,
      message: 'CRUD item not found'
    });
  }

  // Remove image from array
  item.images = item.images.filter(img => img.url !== imageUrl);
  await item.save();

  // Delete physical file
  const filename = path.basename(imageUrl);
  const filePath = path.join(__dirname, '../uploads', filename);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  res.json({
    success: true,
    message: 'Image deleted successfully',
    data: item
  });
});

// @desc    Delete CRUD item
// @route   DELETE /api/crud/:id
// @access  Private
export const deleteCRUDItem = asyncHandler(async (req, res) => {
  const item = await CRUDItem.findOne({
    _id: req.params.id,
    createdBy: req.user.id
  });

  if (!item) {
    return res.status(404).json({
      success: false,
      message: 'CRUD item not found'
    });
  }

  // Delete associated image files
  if (item.images && item.images.length > 0) {
    for (const image of item.images) {
      const filename = path.basename(image.url);
      const filePath = path.join(__dirname, '../uploads', filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  // Soft delete by setting isActive to false
  await CRUDItem.findByIdAndUpdate(req.params.id, { isActive: false });

  // Decrement user's CRUD count
  await User.findByIdAndUpdate(req.user.id, {
    $inc: { crudCount: -1 }
  });

  res.json({
    success: true,
    message: 'CRUD item deleted successfully'
  });
});

// @desc    Get all CRUD items (admin only)
// @route   GET /api/crud/admin/all
// @access  Private/Admin
export const getAllCRUDItems = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const items = await CRUDItem.find({})
    .populate('createdBy', 'name email')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await CRUDItem.countDocuments();

  res.json({
    success: true,
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
});