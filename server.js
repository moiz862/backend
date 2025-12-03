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

// Get port from Railway or default
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Railway requires 0.0.0.0

// Socket.io setup for Railway
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000, // Increased for Railway
  pingInterval: 25000
});

// Make io accessible to routes
app.set('socketio', io);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting - adjusted for Railway
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // Reduced for Railway
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// File upload middleware - use /tmp directory for Railway
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: '/tmp/',
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
  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  next();
});

function sanitizeObject(obj) {
  for (let key in obj) {
    if (obj[key] !== null && typeof obj[key] === 'object') {
      sanitizeObject(obj[key]);
    } else if (typeof obj[key] === 'string') {
      obj[key] = obj[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      obj[key] = obj[key].replace(/<[^>]*(>|$)/g, "");
    }
  }
}

// Ensure uploads directory exists (use /tmp for Railway)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Created uploads directory');
}

// Static files
app.use('/uploads', express.static(uploadsDir));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/crud', crudRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/payments', paymentRoutes);

// Health check endpoint for Railway
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'connected' : 'disconnected';
  
  res.status(200).json({
    success: true,
    message: 'Server is running on Railway',
    timestamp: new Date().toISOString(),
    service: 'backend-api',
    database: dbStatus,
    socketConnections: io.engine.clientsCount,
    uptime: process.uptime()
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

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

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

  socket.on('leave_user', (userId) => {
    if (userId) {
      socket.leave(userId.toString());
      console.log(`❌ User ${userId} left room`);
    }
  });

  socket.on('typing_start', (data) => {
    if (data && data.receiverId) {
      socket.to(data.receiverId).emit('user_typing', {
        userId: data.userId,
        userName: data.userName,
        isTyping: true
      });
    }
  });

  socket.on('typing_stop', (data) => {
    if (data && data.receiverId) {
      socket.to(data.receiverId).emit('user_typing', {
        userId: data.userId,
        userName: data.userName,
        isTyping: false
      });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ User disconnected:', socket.id, 'Reason:', reason);
  });

  socket.emit('welcome', {
    message: 'Connected to Railway server successfully!',
    socketId: socket.id,
    timestamp: new Date().toISOString()
  });
});

// Error handlers
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  // Don't exit in production
});

// Connect to MongoDB and start server
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined in environment variables');
  process.exit(1);
}

// MongoDB connection options for Railway
const mongooseOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
};

mongoose.connect(MONGODB_URI, mongooseOptions)
  .then(() => {
    console.log('✅ MongoDB Connected to Railway');
    
    server.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on ${HOST}:${PORT}`);
      console.log(`🔗 Health check: http://${HOST}:${PORT}/api/health`);
      console.log(`🔌 Socket.io enabled`);
      console.log('🚂 Deployed on Railway');
    });
  })
  .catch(err => {
    console.error('❌ Database connection error:', err.message);
    process.exit(1);
  });

export { io };

