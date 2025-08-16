const express = require('express');
const { Op } = require('sequelize');
const { Vendor, User, SubscriptionPlan, VendorSubscriptionTransaction, Counter, QueueEntry } = require('../models');
const { verifyToken, requireAdmin, checkVendorAccess } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

// Get vendor profile
router.get('/profile', async (req, res) => {
  try {
    const vendor = await Vendor.findByPk(req.user.vendor_id, {
      include: [
        {
          model: SubscriptionPlan,
          as: 'subscription',
          attributes: ['id', 'name', 'price', 'duration_days', 'max_users', 'max_counters', 'features']
        },
        {
          model: User,
          as: 'users',
          attributes: ['id', 'name', 'email', 'mobile', 'role', 'status', 'last_login']
        },
        {
          model: Counter,
          as: 'counters',
          attributes: ['id', 'counter_no', 'counter_name', 'status', 'current_token_number'],
          include: [{
            model: User,
            as: 'doctor',
            attributes: ['id', 'name']
          }]
        }
      ]
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Get subscription status
    const subscriptionStatus = {
      is_active: vendor.subscription_end_date && new Date(vendor.subscription_end_date) > new Date(),
      days_remaining: vendor.subscription_end_date ? 
        Math.ceil((new Date(vendor.subscription_end_date) - new Date()) / (1000 * 60 * 60 * 24)) : 0
    };

    // Get today's statistics
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayStats = await QueueEntry.count({
      where: {
        vendor_id: vendor.id,
        created_at: {
          [Op.gte]: today
        }
      }
    });

    res.json({
      success: true,
      data: {
        vendor,
        subscription_status: subscriptionStatus,
        today_tokens: todayStats
      }
    });

  } catch (error) {
    console.error('Get vendor profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get vendor profile'
    });
  }
});

// Update vendor profile
router.put('/profile', requireAdmin, validate(schemas.vendorUpdate), async (req, res) => {
  try {
    const updateData = req.body;
    
    const vendor = await Vendor.findByPk(req.user.vendor_id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Check if mobile number is already taken by another vendor
    if (updateData.mobile && updateData.mobile !== vendor.mobile) {
      const existingVendor = await Vendor.findOne({
        where: {
          mobile: updateData.mobile,
          id: { [Op.ne]: vendor.id }
        }
      });

      if (existingVendor) {
        return res.status(409).json({
          success: false,
          message: 'Mobile number is already registered with another vendor'
        });
      }
    }

    await vendor.update(updateData);

    // Get updated vendor with relations
    const updatedVendor = await Vendor.findByPk(vendor.id, {
      include: [{
        model: SubscriptionPlan,
        as: 'subscription'
      }]
    });

    res.json({
      success: true,
      message: 'Vendor profile updated successfully',
      data: updatedVendor
    });

  } catch (error) {
    console.error('Update vendor profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vendor profile'
    });
  }
});

// Get vendor subscription history
router.get('/subscription/history', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: transactions } = await VendorSubscriptionTransaction.findAndCountAll({
      where: { vendor_id: req.user.vendor_id },
      include: [{
        model: SubscriptionPlan,
        as: 'subscriptionPlan',
        attributes: ['id', 'name', 'price', 'duration_days', 'max_users', 'max_counters']
      }],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(count / limit),
          total_transactions: count,
          per_page: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get subscription history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription history'
    });
  }
});

// Get vendor analytics/statistics
router.get('/analytics', async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Queue statistics
    const queueStats = await QueueEntry.findAll({
      where: {
        vendor_id: req.user.vendor_id,
        created_at: {
          [Op.gte]: startDate
        }
      },
      attributes: [
        'status',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
        [require('sequelize').fn('DATE', require('sequelize').col('created_at')), 'date']
      ],
      group: ['status', require('sequelize').fn('DATE', require('sequelize').col('created_at'))],
      order: [[require('sequelize').fn('DATE', require('sequelize').col('created_at')), 'ASC']],
      raw: true
    });

    // Counter-wise statistics
    const counterStats = await QueueEntry.findAll({
      where: {
        vendor_id: req.user.vendor_id,
        created_at: {
          [Op.gte]: startDate
        }
      },
      include: [{
        model: Counter,
        as: 'counter',
        attributes: ['id', 'counter_no', 'counter_name']
      }],
      attributes: [
        'counter_id',
        [require('sequelize').fn('COUNT', require('sequelize').col('QueueEntry.id')), 'total_tokens'],
        [require('sequelize').fn('AVG', require('sequelize').literal('TIMESTAMPDIFF(MINUTE, QueueEntry.created_at, QueueEntry.completed_at)')), 'avg_service_time']
      ],
      group: ['counter_id'],
      raw: true
    });

    // Peak hours analysis
    const peakHoursStats = await QueueEntry.findAll({
      where: {
        vendor_id: req.user.vendor_id,
        created_at: {
          [Op.gte]: startDate
        }
      },
      attributes: [
        [require('sequelize').fn('HOUR', require('sequelize').col('created_at')), 'hour'],
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      group: [require('sequelize').fn('HOUR', require('sequelize').col('created_at'))],
      order: [[require('sequelize').fn('COUNT', require('sequelize').col('id')), 'DESC']],
      raw: true
    });

    // Overall summary
    const totalTokens = await QueueEntry.count({
      where: {
        vendor_id: req.user.vendor_id,
        created_at: {
          [Op.gte]: startDate
        }
      }
    });

    const completedTokens = await QueueEntry.count({
      where: {
        vendor_id: req.user.vendor_id,
        status: 'completed',
        created_at: {
          [Op.gte]: startDate
        }
      }
    });

    const averageWaitTime = await QueueEntry.findOne({
      where: {
        vendor_id: req.user.vendor_id,
        status: 'completed',
        created_at: {
          [Op.gte]: startDate
        }
      },
      attributes: [
        [require('sequelize').fn('AVG', require('sequelize').literal('TIMESTAMPDIFF(MINUTE, created_at, called_at)')), 'avg_wait_time']
      ],
      raw: true
    });

    res.json({
      success: true,
      data: {
        period_days: parseInt(period),
        summary: {
          total_tokens: totalTokens,
          completed_tokens: completedTokens,
          completion_rate: totalTokens > 0 ? ((completedTokens / totalTokens) * 100).toFixed(2) : 0,
          average_wait_time: Math.round(averageWaitTime?.avg_wait_time || 0)
        },
        queue_stats: queueStats,
        counter_stats: counterStats,
        peak_hours: peakHoursStats.slice(0, 5) // Top 5 busiest hours
      }
    });

  } catch (error) {
    console.error('Get vendor analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get vendor analytics'
    });
  }
});

// Get vendor settings
router.get('/settings', async (req, res) => {
  try {
    const vendor = await Vendor.findByPk(req.user.vendor_id, {
      attributes: ['id', 'name', 'business_name', 'gst_number', 'pincode', 'address', 'mobile', 'email', 'status'],
      include: [{
        model: SubscriptionPlan,
        as: 'subscription',
        attributes: ['max_users', 'max_counters', 'features']
      }]
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    // Get current usage
    const currentUsage = {
      total_users: await User.count({ where: { vendor_id: req.user.vendor_id } }),
      total_counters: await Counter.count({ where: { vendor_id: req.user.vendor_id } }),
      active_counters: await Counter.count({ 
        where: { 
          vendor_id: req.user.vendor_id,
          status: 'active'
        }
      })
    };

    res.json({
      success: true,
      data: {
        vendor,
        current_usage: currentUsage,
        limits: {
          max_users: vendor.subscription?.max_users || 0,
          max_counters: vendor.subscription?.max_counters || 0
        }
      }
    });

  } catch (error) {
    console.error('Get vendor settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get vendor settings'
    });
  }
});

module.exports = router;