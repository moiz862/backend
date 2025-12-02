import express from 'express';
import {
  getCurrentUser,
  updateProfile,
  updateProfilePicture,
  deactivateAccount,
  getUsers,
  getUser,
  updateUserRole,
  updateUserSubscription,
  activateUser,
  deleteUser
} from '../controllers/userController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// User profile routes (authenticated users)
router.get('/profile', protect, getCurrentUser);
router.put('/profile', protect, updateProfile);
router.put('/profile-picture', protect, updateProfilePicture);
router.put('/deactivate', protect, deactivateAccount);

// Admin only routes
router.get('/', protect, authorize('admin'), getUsers);
router.get('/:id', protect, authorize('admin'), getUser);
router.put('/:id/role', protect, authorize('admin'), updateUserRole);
router.put('/:id/subscription', protect, authorize('admin'), updateUserSubscription);
router.put('/:id/activate', protect, authorize('admin'), activateUser);
router.delete('/:id', protect, authorize('admin'), deleteUser);

export default router;