const express = require('express');
const { Op } = require('sequelize');
const { User, Vendor } = require('../models');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

// Get all users for vendor
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, role, status } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {
      vendor_id: req.user.vendor_id
    };

    if (role) {
      whereClause.role = role;
    }

    if (status !== undefined) {
      whereClause.status = status === 'true';
    }

    const { count, rows: users } = await User.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ['password_hash', 'reset_token', 'reset_token_expires'] },
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(count / limit),
          total_users: count,
          per_page: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users'
    });
  }
});

// Get user by ID
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      where: {
        id: userId,
        vendor_id: req.user.vendor_id
      },
      attributes: { exclude: ['password_hash', 'reset_token', 'reset_token_expires'] },
      include: [{
        model: Vendor,
        as: 'vendor',
        attributes: ['id', 'name', 'business_name']
      }]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user'
    });
  }
});

// Create new user
router.post('/', requireAdmin, validate(schemas.userRegistration), async (req, res) => {
  try {
    const { name, email, mobile, password, role } = req.body;

    // Check if user with email already exists
    const existingUser = await User.findOne({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Check vendor user limits
    const vendor = await Vendor.findByPk(req.user.vendor_id, {
      include: [{
        model: require('../models').SubscriptionPlan,
        as: 'subscription',
        attributes: ['max_users']
      }]
    });

    if (!vendor || !vendor.subscription) {
      return res.status(400).json({
        success: false,
        message: 'Vendor subscription not found'
      });
    }

    const currentUserCount = await User.count({
      where: { vendor_id: req.user.vendor_id }
    });

    if (currentUserCount >= vendor.subscription.max_users) {
      return res.status(400).json({
        success: false,
        message: `User limit reached. Maximum allowed: ${vendor.subscription.max_users}`
      });
    }

    // Create user
    const user = await User.create({
      vendor_id: req.user.vendor_id,
      name,
      email: email.toLowerCase(),
      mobile,
      password_hash: password, // Will be hashed by model hook
      role: role || 'user',
      status: true
    });

    // Return user without sensitive data
    const userData = user.toJSON();
    delete userData.password_hash;
    delete userData.reset_token;
    delete userData.reset_token_expires;

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: userData
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
});

// Update user
router.put('/:userId', requireAdmin, validate(schemas.userUpdate), async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    const user = await User.findOne({
      where: {
        id: userId,
        vendor_id: req.user.vendor_id
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if email is already taken by another user
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await User.findOne({
        where: {
          email: updateData.email.toLowerCase(),
          id: { [Op.ne]: userId }
        }
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Email is already taken by another user'
        });
      }
    }

    // Prevent self-role change if not super admin
    if (updateData.role && req.user.id === userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You cannot change your own role'
      });
    }

    // Convert email to lowercase
    if (updateData.email) {
      updateData.email = updateData.email.toLowerCase();
    }

    await user.update(updateData);

    // Return updated user without sensitive data
    const userData = user.toJSON();
    delete userData.password_hash;
    delete userData.reset_token;
    delete userData.reset_token_expires;

    res.json({
      success: true,
      message: 'User updated successfully',
      data: userData
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
});

// Update user password
router.put('/:userId/password', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { new_password } = req.body;

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const user = await User.findOne({
      where: {
        id: userId,
        vendor_id: req.user.vendor_id
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await user.update({
      password_hash: new_password // Will be hashed by model hook
    });

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update password'
    });
  }
});

// Delete user (soft delete)
router.delete('/:userId', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      where: {
        id: userId,
        vendor_id: req.user.vendor_id
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent self-deletion
    if (req.user.id === userId) {
      return res.status(403).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    // Check if user is assigned to any active counters
    const { Counter } = require('../models');
    const assignedCounters = await Counter.count({
      where: {
        doctor_id: userId,
        status: 'active'
      }
    });

    if (assignedCounters > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete user who is assigned to active counters'
      });
    }

    await user.destroy(); // Soft delete

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
});

// Toggle user status
router.patch('/:userId/toggle-status', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      where: {
        id: userId,
        vendor_id: req.user.vendor_id
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent self-deactivation
    if (req.user.id === userId) {
      return res.status(403).json({
        success: false,
        message: 'You cannot deactivate your own account'
      });
    }

    await user.update({
      status: !user.status
    });

    res.json({
      success: true,
      message: `User ${user.status ? 'activated' : 'deactivated'} successfully`,
      data: {
        id: user.id,
        status: user.status
      }
    });

  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle user status'
    });
  }
});

// Get user activity/statistics
router.get('/:userId/activity', async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = '30' } = req.query; // days

    const user = await User.findOne({
      where: {
        id: userId,
        vendor_id: req.user.vendor_id
      },
      attributes: { exclude: ['password_hash', 'reset_token', 'reset_token_expires'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get queue entries created by user
    const { QueueEntry } = require('../models');
    const createdTokens = await QueueEntry.count({
      where: {
        created_by: userId,
        created_at: {
          [Op.gte]: startDate
        }
      }
    });

    // Get queue entries assigned to user
    const assignedTokens = await QueueEntry.count({
      where: {
        assigned_to: userId,
        created_at: {
          [Op.gte]: startDate
        }
      }
    });

    // Get completed services
    const completedServices = await QueueEntry.count({
      where: {
        assigned_to: userId,
        status: 'completed',
        created_at: {
          [Op.gte]: startDate
        }
      }
    });

    res.json({
      success: true,
      data: {
        user,
        period_days: parseInt(period),
        activity: {
          created_tokens: createdTokens,
          assigned_tokens: assignedTokens,
          completed_services: completedServices,
          completion_rate: assignedTokens > 0 ? ((completedServices / assignedTokens) * 100).toFixed(2) : 0
        }
      }
    });

  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user activity'
    });
  }
});

module.exports = router;