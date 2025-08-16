const express = require('express');
const { SubscriptionPlan } = require('../models');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Get all available subscription plans (public)
router.get('/plans', async (req, res) => {
  try {
    const plans = await SubscriptionPlan.findAll({
      where: { is_active: true },
      attributes: ['id', 'name', 'price', 'duration_days', 'max_users', 'max_counters', 'features', 'is_trial'],
      order: [['price', 'ASC']]
    });

    res.json({
      success: true,
      data: plans
    });

  } catch (error) {
    console.error('Get subscription plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription plans'
    });
  }
});

// Get specific subscription plan details (public)
router.get('/plans/:planId', async (req, res) => {
  try {
    const { planId } = req.params;

    const plan = await SubscriptionPlan.findOne({
      where: { 
        id: planId,
        is_active: true 
      }
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    res.json({
      success: true,
      data: plan
    });

  } catch (error) {
    console.error('Get subscription plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription plan'
    });
  }
});

module.exports = router;