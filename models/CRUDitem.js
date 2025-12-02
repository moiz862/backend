import mongoose from 'mongoose';

const crudItemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a title'],
    maxlength: 100,
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Please provide a description'],
    maxlength: 500
  },
  content: {
    type: String,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  images: [{
    url: String,
    filename: String,
    originalName: String
  }],
  tags: [String],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better query performance
crudItemSchema.index({ createdBy: 1, createdAt: -1 });
crudItemSchema.index({ tags: 1 });

export default mongoose.model('CRUDItem', crudItemSchema);