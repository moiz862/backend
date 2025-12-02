export const subscriptionPlans = {
  premium: {
    monthly: 9.99,
    yearly: 99.99, // ~$8.33/month
    lifetime: 299.99
  },
  pro: {
    monthly: 19.99,
    yearly: 199.99, // ~$16.66/month
    lifetime: 499.99
  },
  enterprise: {
    monthly: 49.99,
    yearly: 499.99, // ~$41.66/month
    lifetime: 999.99
  }
};

export const getPlanPrice = (planType, duration) => {
  return subscriptionPlans[planType]?.[duration] || null;
};

export const getAllPlans = () => {
  return subscriptionPlans;
};