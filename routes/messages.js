import express from 'express';
import {
  sendMessage,
  getConversation,
  getConversations,
  markMessagesAsRead,
  deleteMessage,
  getUnreadCount,
  sendTypingIndicator
} from '../controllers/messageController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes are protected
router.use(protect);

router.post('/', sendMessage);
router.get('/conversations', getConversations);
router.get('/conversation/:userId', getConversation);
router.put('/mark-read', markMessagesAsRead);
router.delete('/:id', deleteMessage);
router.get('/unread-count', getUnreadCount);
router.post('/typing', sendTypingIndicator);

export default router;