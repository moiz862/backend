import express from 'express';
import {
  createPaymentIntent,
  confirmPayment,
  getPaymentStatus,
  getPaymentHistory,
  getPayment,
  getAllPayments,
  handleWebhook,
  getTestCards,
  getSubscriptionPlans,  // Add this
  quickUpgrade
} from '../controllers/paymentController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Webhook route (must be before body parser middleware)
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// Public routes
router.get('/test-cards', getTestCards);
router.get('/plans', getSubscriptionPlans);  // Add this route

// User payment routes
router.post('/create-payment-intent', protect, createPaymentIntent);
router.post('/confirm-payment', protect, confirmPayment);
router.get('/status/:paymentIntentId', protect, getPaymentStatus);
router.get('/history', protect, getPaymentHistory);
router.get('/:id', protect, getPayment);
router.post('/quick-upgrade', protect, quickUpgrade);  
// Admin only routes
router.get('/admin/all', protect, authorize('admin'), getAllPayments);

export default router;