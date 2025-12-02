import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
export const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');

  res.json({
    success: true,
    data: user
  });
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
export const updateProfile = asyncHandler(async (req, res) => {
  const { name, email } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user.id,
    { name, email },
    { 
      new: true, 
      runValidators: true 
    }
  ).select('-password');

  res.json({
    success: true,
    data: user
  });
});

// @desc    Update user profile picture with file upload
// @route   PUT /api/users/profile-picture
// @access  Private
export const updateProfilePicture = asyncHandler(async (req, res) => {
  if (!req.files || !req.files.profilePicture) {
    return res.status(400).json({
      success: false,
      message: 'Please upload a profile picture'
    });
  }

  const profilePictureFile = req.files.profilePicture;
  
  // Check file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(profilePictureFile.mimetype)) {
    return res.status(400).json({
      success: false,
      message: 'Only image files are allowed (JPEG, PNG, GIF, WebP)'
    });
  }

  // Check file size (5MB max)
  if (profilePictureFile.size > 5 * 1024 * 1024) {
    return res.status(400).json({
      success: false,
      message: 'File size too large. Maximum size is 5MB'
    });
  }

  // Generate unique filename
  const fileExtension = path.extname(profilePictureFile.name);
  const fileName = `profile-${req.user.id}-${Date.now()}${fileExtension}`;
  const uploadPath = path.join(__dirname, '../uploads', fileName);

  // Create uploads directory if it doesn't exist
  const uploadDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Move file to uploads directory
  await profilePictureFile.mv(uploadPath);

  const profilePictureUrl = `/uploads/${fileName}`;

  // Update user profile picture in database
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { profilePicture: profilePictureUrl },
    { new: true, runValidators: true }
  ).select('-password');

  res.json({
    success: true,
    data: user,
    message: 'Profile picture updated successfully'
  });
});

// @desc    Deactivate user account
// @route   PUT /api/users/deactivate
// @access  Private
export const deactivateAccount = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user.id,
    { isActive: false }
  );

  res.json({
    success: true,
    message: 'Account deactivated successfully'
  });
});

// @desc    Get all users (admin only)
// @route   GET /api/users
// @access  Private/Admin
export const getUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const users = await User.find({})
    .select('-password')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await User.countDocuments();

  res.json({
    success: true,
    data: users,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  res.json({
    success: true,
    data: user
  });
});

// @desc    Update user role
// @route   PUT /api/users/:id/role
// @access  Private/Admin
export const updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { role },
    { new: true, runValidators: true }
  ).select('-password');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  res.json({
    success: true,
    data: user
  });
});

// @desc    Update user subscription
// @route   PUT /api/users/:id/subscription
// @access  Private/Admin
export const updateUserSubscription = asyncHandler(async (req, res) => {
  const { plan, stripeCustomerId, stripeSubscriptionId, status } = req.body;

  const user = await User.findByIdAndUpdate(
    req.params.id,
    {
      subscription: {
        plan,
        stripeCustomerId,
        stripeSubscriptionId,
        status
      }
    },
    { new: true, runValidators: true }
  ).select('-password');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  res.json({
    success: true,
    data: user
  });
});

// @desc    Activate user account
// @route   PUT /api/users/:id/activate
// @access  Private/Admin
export const activateUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: true },
    { new: true }
  ).select('-password');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  res.json({
    success: true,
    data: user,
    message: 'User account activated successfully'
  });
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Prevent admin from deleting themselves
  if (user._id.toString() === req.user.id) {
    return res.status(400).json({
      success: false,
      message: 'You cannot delete your own account'
    });
  }

  await User.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});