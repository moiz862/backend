import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import validator from 'validator';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    maxlength: 50,
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  crudCount: {
    type: Number,
    default: 0
  },
  subscription: {
    type: {
      plan: {
        type: String,
        enum: ['free', 'premium'],
        default: 'free'
      },
      stripeCustomerId: String,
      stripeSubscriptionId: String,
      status: {
        type: String,
        enum: ['active', 'canceled', 'past_due'],
        default: 'active'
      }
    },
    default: {}
  },
  profilePicture: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Encrypt password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Set admin role for specific emails before saving
userSchema.pre('save', function(next) {
  const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [];
  
  if (adminEmails.includes(this.email)) {
    this.role = 'admin';
  }
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if user can create more CRUD operations
userSchema.methods.canCreateCRUD = function() {
  const freeLimit = process.env.FREE_CRUD_LIMIT || 5;
  return this.subscription.plan === 'premium' || this.crudCount < freeLimit;
};

export default mongoose.model('User', userSchema);