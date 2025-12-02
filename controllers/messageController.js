import Message from '../models/Message.js';
import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @desc    Send a message with file upload support
// @route   POST /api/messages
// @access  Private
export const sendMessage = asyncHandler(async (req, res) => {
  let { receiver, content, messageType = 'text' } = req.body;

  console.log('📨 Send message request received');
  console.log('Body:', req.body);
  console.log('Files:', req.files);

  // Handle form data (files come as form data, not JSON)
  if (req.files && Object.keys(req.files).length > 0) {
    // If files are present, we need to parse form data fields
    receiver = receiver || req.body.receiver;
    content = content || req.body.content;
    messageType = messageType || req.body.messageType || 'text';
  }

  // Check if receiver exists
  if (!receiver) {
    return res.status(400).json({
      success: false,
      message: 'Receiver ID is required'
    });
  }

  const receiverUser = await User.findById(receiver);
  if (!receiverUser) {
    return res.status(404).json({
      success: false,
      message: 'Receiver not found'
    });
  }

  // Prevent sending message to yourself
  if (receiver === req.user.id) {
    return res.status(400).json({
      success: false,
      message: 'Cannot send message to yourself'
    });
  }

  // Validate message content
  if (!content || content.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Message content is required'
    });
  }

  // Handle file uploads for attachments
  let attachments = [];
  if (req.files && req.files.attachments) {
    const uploadedFiles = Array.isArray(req.files.attachments) ? req.files.attachments : [req.files.attachments];
    
    console.log(`📤 Processing ${uploadedFiles.length} file(s)`);
    
    for (const file of uploadedFiles) {
      // Check file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file type. Only images and PDFs are allowed'
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
      const fileName = `message-${req.user.id}-${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
      const uploadPath = path.join(__dirname, '../uploads', fileName);

      // Create uploads directory if it doesn't exist
      const uploadDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Move file to uploads directory
      await file.mv(uploadPath);
      console.log(`✅ File uploaded: ${fileName}`);

      attachments.push({
        url: `/uploads/${fileName}`,
        filename: fileName,
        originalName: file.name,
        size: file.size,
        mimetype: file.mimetype
      });
    }
  }

  const message = await Message.create({
    sender: req.user.id,
    receiver,
    content: content.trim(),
    messageType: attachments.length > 0 ? 'file' : messageType,
    attachments
  });

  // Populate sender and receiver details
  await message.populate('sender', 'name email profilePicture');
  await message.populate('receiver', 'name email profilePicture');

  console.log('✅ Message created:', message._id);

  // Get the Socket.io instance from app
  const io = req.app.get('socketio');
  
  // Emit real-time message to receiver
  if (io) {
    console.log(`📡 Emitting socket events for message: ${message._id}`);
    console.log(`📨 Sending to receiver: ${receiver}`);
    console.log(`📨 Sending to sender: ${req.user.id}`);
    
    // Emit to receiver
    io.to(receiver.toString()).emit('receive_message', {
      success: true,
      data: message,
      event: 'new_message'
    });

    // Also emit to sender for real-time update in their own UI
    io.to(req.user.id.toString()).emit('message_sent', {
      success: true,
      data: message,
      event: 'message_sent'
    });

    // Emit conversation update to both users
    io.to(receiver.toString()).emit('conversation_updated', {
      userId: req.user.id,
      lastMessage: message,
      event: 'conversation_updated'
    });

    io.to(req.user.id.toString()).emit('conversation_updated', {
      userId: receiver,
      lastMessage: message,
      event: 'conversation_updated'
    });

    console.log('✅ Socket events emitted successfully');
  } else {
    console.log('❌ Socket.io not available');
  }

  res.status(201).json({
    success: true,
    data: message,
    message: 'Message sent successfully'
  });
});

// @desc    Get conversation between two users
// @route   GET /api/messages/conversation/:userId
// @access  Private
export const getConversation = asyncHandler(async (req, res) => {
  const otherUserId = req.params.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  // Validate other user exists
  const otherUser = await User.findById(otherUserId).select('name email profilePicture');
  if (!otherUser) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  const messages = await Message.find({
    $or: [
      { sender: req.user.id, receiver: otherUserId },
      { sender: otherUserId, receiver: req.user.id }
    ]
  })
    .populate('sender', 'name email profilePicture')
    .populate('receiver', 'name email profilePicture')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  // Mark messages as read
  const unreadMessages = await Message.find({
    sender: otherUserId,
    receiver: req.user.id,
    isRead: false
  });

  if (unreadMessages.length > 0) {
    await Message.updateMany(
      {
        sender: otherUserId,
        receiver: req.user.id,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );

    // Emit read receipt via Socket.io
    const io = req.app.get('socketio');
    if (io) {
      io.to(otherUserId.toString()).emit('messages_read', {
        userId: req.user.id,
        messageIds: unreadMessages.map(msg => msg._id)
      });
    }
  }

  const total = await Message.countDocuments({
    $or: [
      { sender: req.user.id, receiver: otherUserId },
      { sender: otherUserId, receiver: req.user.id }
    ]
  });

  res.json({
    success: true,
    data: {
      messages: messages.reverse(), // Reverse to get chronological order
      otherUser,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Get user's conversations list
// @route   GET /api/messages/conversations
// @access  Private
export const getConversations = asyncHandler(async (req, res) => {
  const conversations = await Message.aggregate([
    {
      $match: {
        $or: [
          { sender: new mongoose.Types.ObjectId(req.user.id) },
          { receiver: new mongoose.Types.ObjectId(req.user.id) }
        ]
      }
    },
    {
      $sort: { createdAt: -1 }
    },
    {
      $group: {
        _id: {
          $cond: [
            { $eq: ['$sender', new mongoose.Types.ObjectId(req.user.id)] },
            '$receiver',
            '$sender'
          ]
        },
        lastMessage: { $first: '$$ROOT' },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$receiver', new mongoose.Types.ObjectId(req.user.id)] },
                  { $eq: ['$isRead', false] }
                ]
              },
              1,
              0
            ]
          }
        },
        totalMessages: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: '$user'
    },
    {
      $project: {
        'user.password': 0,
        'user.subscription': 0,
        'user.crudCount': 0,
        'user.role': 0,
        'user.isActive': 0
      }
    },
    {
      $sort: { 'lastMessage.createdAt': -1 }
    }
  ]);

  res.json({
    success: true,
    data: conversations
  });
});

export const markMessagesAsRead = asyncHandler(async (req, res) => {
  const { messageIds } = req.body;

  // Validate messageIds
  if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Message IDs array is required'
    });
  }

  try {
    // Update messages where:
    // - message is in the provided IDs
    // - receiver is the current user
    // - message is not already read
    const result = await Message.updateMany(
      {
        _id: { $in: messageIds },
        receiver: req.user.id,
        isRead: false
      },
      {
        $set: {
          isRead: true,
          readAt: new Date()
        }
      }
    );

    console.log(`✅ Marked ${result.modifiedCount} messages as read`);

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} messages as read`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while marking messages as read'
    });
  }
});

// @desc    Delete a message
// @route   DELETE /api/messages/:id
// @access  Private
export const deleteMessage = asyncHandler(async (req, res) => {
  const message = await Message.findOne({
    _id: req.params.id,
    sender: req.user.id // Only sender can delete the message
  });

  if (!message) {
    return res.status(404).json({
      success: false,
      message: 'Message not found or you are not authorized to delete this message'
    });
  }

  const deletedMessage = await Message.findByIdAndDelete(req.params.id);

  // Emit delete event via Socket.io
  const io = req.app.get('socketio');
  if (io) {
    io.to(message.receiver.toString()).emit('message_deleted', {
      messageId: req.params.id,
      deletedBy: req.user.id
    });
  }

  res.json({
    success: true,
    message: 'Message deleted successfully',
    data: deletedMessage
  });
});

// @desc    Get unread message count
// @route   GET /api/messages/unread-count
// @access  Private
export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Message.countDocuments({
    receiver: req.user.id,
    isRead: false
  });

  res.json({
    success: true,
    data: { unreadCount: count }
  });
});

// @desc    Send typing indicator
// @route   POST /api/messages/typing
// @access  Private
export const sendTypingIndicator = asyncHandler(async (req, res) => {
  const { receiverId, isTyping } = req.body;

  if (!receiverId) {
    return res.status(400).json({
      success: false,
      message: 'Receiver ID is required'
    });
  }

  const io = req.app.get('socketio');
  if (io) {
    io.to(receiverId.toString()).emit('typing_indicator', {
      userId: req.user.id,
      isTyping: Boolean(isTyping),
      userName: req.user.name
    });
  }

  res.json({
    success: true,
    message: isTyping ? 'Typing indicator sent' : 'Typing indicator stopped'
  });
});