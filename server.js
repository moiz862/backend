import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import http from 'http';
import { Server } from 'socket.io';
import fileUpload from 'express-fileupload';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Load env vars
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import crudRoutes from './routes/crud.js';
import messageRoutes from './routes/messages.js';
import paymentRoutes from './routes/payments.js';

const app = express();
const server = http.createServer(app);

// Socket.io setup with CORS - FIXED CONFIGURATION
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ['websocket', 'polling'] // Add multiple transports
});

// Make io accessible to routes
app.set('socketio', io);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
});
app.use(limiter);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// File upload middleware
app.use(fileUpload({
  createParentPath: true,
  limits: { 
    fileSize: 5 * 1024 * 1024
  },
  abortOnLimit: true,
  safeFileNames: true,
  preserveExtension: true
}));

// CORS middleware
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));

// Custom XSS protection middleware
app.use((req, res, next) => {
  if (req.body) {
    sanitizeObject(req.body);
  }
  
  if (req.query) {
    sanitizeObject(req.query);
  }
  
  next();
});

function sanitizeObject(obj) {
  for (let key in obj) {
    if (obj[key] !== null && typeof obj[key] === 'object') {
      sanitizeObject(obj[key]);
    } else if (typeof obj[key] === 'string') {
      obj[key] = obj[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      obj[key] = obj[key].replace(/<[^>]*(>|$)/g, "");
      obj[key] = obj[key].replace(/javascript:/gi, "");
      obj[key] = obj[key].replace(/on\w+=/gi, "");
    }
  }
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Created uploads directory');
}

// Static files - serve uploads directory
app.use('/uploads', express.static(uploadsDir));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/crud', crudRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/payments', paymentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    socketConnections: io.engine.clientsCount
  });
});

// Socket.io status endpoint
app.get('/api/socket-status', (req, res) => {
  const sockets = [];
  
  io.of('/').sockets.forEach(socket => {
    sockets.push({
      id: socket.id,
      rooms: Array.from(socket.rooms),
      connected: socket.connected
    });
  });

  res.json({
    success: true,
    data: {
      totalConnections: io.engine.clientsCount,
      sockets: sockets
    }
  });
});

// Socket.io connection handling with better error handling
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // Join user to their personal room
  socket.on('join_user', (userId) => {
    if (userId) {
      socket.join(userId.toString());
      console.log(`✅ User ${userId} joined room`);
      
      socket.emit('joined_room', {
        room: userId.toString(),
        message: 'Successfully joined user room'
      });
    }
  });

  // Leave user room
  socket.on('leave_user', (userId) => {
    if (userId) {
      socket.leave(userId.toString());
      console.log(`❌ User ${userId} left room`);
    }
  });

  // Handle typing indicators
  socket.on('typing_start', (data) => {
    if (data && data.receiverId) {
      console.log(`⌨️ User ${data.userId} typing to ${data.receiverId}`);
      socket.to(data.receiverId).emit('user_typing', {
        userId: data.userId,
        userName: data.userName,
        isTyping: true
      });
    }
  });

  socket.on('typing_stop', (data) => {
    if (data && data.receiverId) {
      console.log(`❌ User ${data.userId} stopped typing to ${data.receiverId}`);
      socket.to(data.receiverId).emit('user_typing', {
        userId: data.userId,
        userName: data.userName,
        isTyping: false
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log('❌ User disconnected:', socket.id, 'Reason:', reason);
  });

  // Send welcome message
  socket.emit('welcome', {
    message: 'Connected to server successfully!',
    socketId: socket.id,
    timestamp: new Date().toISOString()
  });
});

// Basic error handler middleware
app.use((err, req, res, next) => {
  console.error('Error stack:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!'
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', err);
  process.exit(1);
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crudapp')
  .then(() => {
    console.log('✅ MongoDB Connected');
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📁 Uploads directory: ${uploadsDir}`);
      console.log(`🔌 Socket.io enabled on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  });

export { io };
