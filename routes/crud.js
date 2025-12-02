import express from 'express';
import {
  getCRUDItems,
  getCRUDItem,
  createCRUDItem,
  updateCRUDItem,
  deleteCRUDItem,
  getAllCRUDItems,
  deleteImageFromCRUD
} from '../controllers/crudController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// User CRUD routes
router.get('/', protect, getCRUDItems);
router.get('/:id', protect, getCRUDItem);
router.post('/', protect, createCRUDItem);
router.put('/:id', protect, updateCRUDItem);
router.delete('/:id', protect, deleteCRUDItem);
router.delete('/:id/images', protect, deleteImageFromCRUD);

// Admin only routes
router.get('/admin/all', protect, authorize('admin'), getAllCRUDItems);

export default router;