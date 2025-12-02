import Payment from '../models/Payment.js';
import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';

// Mock Stripe functions for development
const mockStripe = {
  customers: {
    list: async ({ email }) => {
      // Mock customer lookup
      return { data: [] }; // Return empty to simulate new customer
    },
    create: async (customerData) => {
      // Mock customer creation
      return {
        id: `cus_mock_${Date.now()}`,
        ...customerData
      };
    }
  },
  paymentIntents: {
    create: async (paymentIntentData) => {
      // Mock payment intent creation
      return {
        id: `pi_mock_${Date.now()}`,
        client_secret: `mock_client_secret_${Date.now()}`,
        status: 'requires_payment_method',
        ...paymentIntentData
      };
    },
    retrieve: async (paymentIntentId) => {
      // Mock payment intent retrieval
      return {
        id: paymentIntentId,
        status: 'succeeded', // Always succeed in mock mode
        amount: 999,
        currency: 'usd',
        payment_method_types: ['card'],
        created: Date.now()
      };
    },
    confirm: async (paymentIntentId) => {
      // Mock payment confirmation
      return {
        id: paymentIntentId,
        status: 'succeeded',
        amount: 999,
        currency: 'usd'
      };
    }
  }
};

// Subscription plans configuration
export const subscriptionPlans = [
  {
    type: 'free',
    name: 'Free',
    description: 'Perfect for getting started',
    price: {
      monthly: 0,
      yearly: 0
    },
    features: [
      'Up to 5 CRUD items',
      'Basic messaging',
      'Standard support',
      '1GB storage'
    ]
  },
  {
    type: 'premium',
    name: 'Premium',
    description: 'Best for power users',
    price: {
      monthly: 9.99,
      yearly: 95.88 // $7.99/month when billed yearly
    },
    features: [
      'Unlimited CRUD items',
      'Advanced messaging with files',
      'Priority support',
      '10GB storage',
      'Advanced analytics',
      'Custom themes'
    ]
  },
  {
    type: 'enterprise',
    name: 'Enterprise',
    description: 'For teams and businesses',
    price: {
      monthly: 29.99,
      yearly: 287.88 // $23.99/month when billed yearly
    },
    features: [
      'Everything in Premium',
      'Unlimited storage',
      'Dedicated support',
      'Custom integrations',
      'API access',
      'Team management'
    ]
  }
];

// Helper function to get plan price
export const getPlanPrice = (planType, duration = 'monthly') => {
  const plan = subscriptionPlans.find(p => p.type === planType);
  return plan ? plan.price[duration] : null;
};

// @desc    Get subscription plans
// @route   GET /api/payments/plans
// @access  Public
export const getSubscriptionPlans = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: subscriptionPlans,
    message: 'Subscription plans retrieved successfully'
  });
});

// @desc    Create payment intent
// @route   POST /api/payments/create-payment-intent
// @access  Private
export const createPaymentIntent = asyncHandler(async (req, res) => {
  const { planType = 'premium', duration = 'monthly' } = req.body;

  try {
    // Get the price based on plan and duration
    const amount = getPlanPrice(planType, duration);
    
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan type or duration'
      });
    }

    // For free plan, handle differently
    if (planType === 'free') {
      return res.status(400).json({
        success: false,
        message: 'Free plan is already active'
      });
    }

    // Create mock customer
    const customer = await mockStripe.customers.create({
      email: req.user.email,
      name: req.user.name,
      metadata: {
        userId: req.user.id.toString()
      }
    });

    // Create mock payment intent
    const paymentIntent = await mockStripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      customer: customer.id,
      description: `${planType.charAt(0).toUpperCase() + planType.slice(1)} ${duration} subscription`,
      metadata: {
        userId: req.user.id.toString(),
        planType,
        duration,
        environment: 'development'
      }
    });

    // Save payment intent to database
    const payment = await Payment.create({
      user: req.user.id,
      stripePaymentIntentId: paymentIntent.id,
      stripeCustomerId: customer.id,
      amount,
      currency: 'usd',
      status: 'requires_payment_method',
      description: `${planType.charAt(0).toUpperCase() + planType.slice(1)} ${duration} subscription`,
      planType,
      duration,
      metadata: {
        userId: req.user.id.toString(),
        planType,
        duration
      }
    });

    console.log(`💰 Mock payment intent created: ${paymentIntent.id} for user ${req.user.email}`);

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        planType,
        duration,
        testMode: true,
        message: 'MOCK MODE: Use any test card details'
      },
      message: 'Payment intent created successfully (Mock Mode)'
    });

  } catch (error) {
    console.error('Payment intent error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment intent',
      error: error.message
    });
  }
});

// @desc    Confirm payment and update user subscription
// @route   POST /api/payments/confirm-payment
// @access  Private
export const confirmPayment = asyncHandler(async (req, res) => {
  const { paymentIntentId } = req.body;

  try {
    // Retrieve mock payment intent
    const paymentIntent = await mockStripe.paymentIntents.retrieve(paymentIntentId);

    // Find the payment in our database
    const payment = await Payment.findOne({ 
      stripePaymentIntentId: paymentIntentId,
      user: req.user.id
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // In mock mode, always succeed the payment
    payment.status = 'succeeded';
    payment.paymentMethod = 'card';
    await payment.save();

    // Update user subscription
    await User.findByIdAndUpdate(req.user.id, {
      'subscription.plan': payment.planType,
      'subscription.status': 'active',
      'subscription.startedAt': new Date(),
      'subscription.duration': payment.duration,
      'subscription.stripeCustomerId': payment.stripeCustomerId
    });

    // Populate payment with user data
    await payment.populate('user', 'name email subscription');

    console.log(`✅ Mock payment confirmed: ${paymentIntentId} for user ${req.user.email}`);

    res.json({
      success: true,
      data: payment,
      message: 'Payment confirmed successfully! Your account has been upgraded to premium.'
    });

  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error confirming payment',
      error: error.message
    });
  }
});

// @desc    Get payment status
// @route   GET /api/payments/status/:paymentIntentId
// @access  Private
export const getPaymentStatus = asyncHandler(async (req, res) => {
  try {
    const paymentIntent = await mockStripe.paymentIntents.retrieve(req.params.paymentIntentId);
    
    const payment = await Payment.findOne({ 
      stripePaymentIntentId: req.params.paymentIntentId 
    }).populate('user', 'name email');

    res.json({
      success: true,
      data: {
        paymentIntent: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
          created: paymentIntent.created
        },
        payment: payment
      }
    });

  } catch (error) {
    console.error('Payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving payment status',
      error: error.message
    });
  }
});

// @desc    Get user's payment history
// @route   GET /api/payments/history
// @access  Private
export const getPaymentHistory = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const payments = await Payment.find({ user: req.user.id })
    .populate('user', 'name email')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await Payment.countDocuments({ user: req.user.id });

  res.json({
    success: true,
    data: payments,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get payment by ID
// @route   GET /api/payments/:id
// @access  Private
export const getPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({
    _id: req.params.id,
    user: req.user.id
  }).populate('user', 'name email subscription');

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: 'Payment not found'
    });
  }

  res.json({
    success: true,
    data: payment
  });
});

// @desc    Get all payments (admin only)
// @route   GET /api/payments/admin/all
// @access  Private/Admin
export const getAllPayments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const payments = await Payment.find({})
    .populate('user', 'name email')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await Payment.countDocuments();

  res.json({
    success: true,
    data: payments,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Handle mock webhook (for testing)
// @route   POST /api/payments/webhook
// @access  Public
export const handleWebhook = asyncHandler(async (req, res) => {
  console.log('🔄 Mock webhook received (development mode)');
  
  // In development, we'll simulate a successful payment
  const { paymentIntentId, userId, planType } = req.body;

  try {
    if (paymentIntentId && userId) {
      // Update payment status
      await Payment.findOneAndUpdate(
        { stripePaymentIntentId: paymentIntentId },
        { 
          status: 'succeeded',
          paymentMethod: 'card'
        }
      );

      // Update user subscription
      await User.findByIdAndUpdate(userId, {
        'subscription.plan': planType || 'premium',
        'subscription.status': 'active',
        'subscription.startedAt': new Date()
      });

      console.log(`✅ Mock webhook processed: User ${userId} upgraded to ${planType}`);
    }
  } catch (error) {
    console.error('Mock webhook error:', error);
  }

  res.json({ 
    received: true,
    message: 'Mock webhook processed successfully (development mode)'
  });
});

// @desc    Get test cards information
// @route   GET /api/payments/test-cards
// @access  Public
export const getTestCards = asyncHandler(async (req, res) => {
  const testCards = [
    {
      number: '4242424242424242',
      expiry: '12/34',
      cvc: '123',
      description: 'Visa (successful payment)'
    },
    {
      number: '4000000000000002',
      expiry: '12/34', 
      cvc: '123',
      description: 'Visa (payment declined)'
    },
    {
      number: '4000002500003155',
      expiry: '12/34',
      cvc: '123',
      description: 'Requires authentication'
    },
    {
      number: '5555555555554444',
      expiry: '12/34',
      cvc: '123',
      description: 'Mastercard (successful payment)'
    },
    {
      number: '2223003122003222',
      expiry: '12/34',
      cvc: '123',
      description: 'Mastercard (2-series)'
    }
  ];

  res.json({
    success: true,
    data: testCards,
    message: 'Use any card details in mock mode. No real payment will be processed.',
    environment: 'DEVELOPMENT MODE - MOCK PAYMENTS',
    instructions: [
      'Any card number will work in development mode',
      'No real payment is processed',
      'Use any future expiry date',
      'Use any 3-digit CVC',
      'Your subscription will be activated immediately'
    ]
  });
});

// @desc    Quick upgrade endpoint (for testing)
// @route   POST /api/payments/quick-upgrade
// @access  Private
export const quickUpgrade = asyncHandler(async (req, res) => {
  const { planType = 'premium', duration = 'monthly' } = req.body;

  try {
    // Create a mock payment record
    const payment = await Payment.create({
      user: req.user.id,
      stripePaymentIntentId: `pi_mock_quick_${Date.now()}`,
      stripeCustomerId: `cus_mock_quick_${Date.now()}`,
      amount: getPlanPrice(planType, duration),
      currency: 'usd',
      status: 'succeeded',
      description: `${planType.charAt(0).toUpperCase() + planType.slice(1)} ${duration} subscription (Quick Upgrade)`,
      planType,
      duration,
      paymentMethod: 'card'
    });

    // Update user subscription
    await User.findByIdAndUpdate(req.user.id, {
      'subscription.plan': planType,
      'subscription.status': 'active',
      'subscription.startedAt': new Date(),
      'subscription.duration': duration
    });

    const updatedUser = await User.findById(req.user.id);

    console.log(`⚡ Quick upgrade: User ${req.user.email} to ${planType} plan`);

    res.json({
      success: true,
      data: {
        user: updatedUser,
        payment: payment
      },
      message: `Successfully upgraded to ${planType} plan!`
    });

  } catch (error) {
    console.error('Quick upgrade error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during quick upgrade',
      error: error.message
    });
  }
});