import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  stripePaymentIntentId: {
    type: String,
    required: true,
    unique: true
  },
  stripeCustomerId: String,
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'usd'
  },
  status: {
    type: String,
    enum: ['requires_payment_method', 'requires_confirmation', 'processing', 'requires_action', 'succeeded', 'canceled'],
    default: 'requires_payment_method'
  },
  paymentMethod: {
    type: String
  },
  description: String,
  planType: {
    type: String,
    enum: ['premium', 'pro', 'enterprise'],
    default: 'premium'
  },
  duration: {
    type: String,
    enum: ['monthly', 'yearly', 'lifetime'],
    default: 'monthly'
  },
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

// Index for better query performance
paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ stripePaymentIntentId: 1 });

export default mongoose.model('Payment', paymentSchema);