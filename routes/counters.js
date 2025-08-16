const express = require('express');
const { Counter, User, Vendor, QueueEntry } = require('../models');
const { verifyToken, requireAdmin, requireReceptionist } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { Op } = require('sequelize');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

// Get all counters for vendor
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;

    const whereClause = {
      vendor_id: req.user.vendor_id
    };

    if (status) {
      whereClause.status = status;
    }

    const counters = await Counter.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'doctor',
          attributes: ['id', 'name', 'email', 'mobile']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name']
        }
      ],
      order: [['counter_no', 'ASC']]
    });

    res.json({
      success: true,
      data: counters
    });

  } catch (error) {
    console.error('Get counters error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get counters'
    });
  }
});

// Get counter by ID
router.get('/:counterId', async (req, res) => {
  try {
    const { counterId } = req.params;

    const counter = await Counter.findOne({
      where: {
        id: counterId,
        vendor_id: req.user.vendor_id
      },
      include: [
        {
          model: User,
          as: 'doctor',
          attributes: ['id', 'name', 'email', 'mobile', 'role']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name']
        },
        {
          model: Vendor,
          as: 'vendor',
          attributes: ['id', 'name', 'business_name']
        }
      ]
    });

    if (!counter) {
      return res.status(404).json({
        success: false,
        message: 'Counter not found'
      });
    }

    // Get current queue stats
    const queueStats = {
      total_waiting: await QueueEntry.count({
        where: {
          counter_id: counterId,
          status: 'waiting'
        }
      }),
      total_in_progress: await QueueEntry.count({
        where: {
          counter_id: counterId,
          status: 'in_progress'
        }
      }),
      total_today: await QueueEntry.count({
        where: {
          counter_id: counterId,
          created_at: {
            [Op.gte]: new Date().setHours(0, 0, 0, 0)
          }
        }
      })
    };

    res.json({
      success: true,
      data: {
        counter,
        queue_stats: queueStats
      }
    });

  } catch (error) {
    console.error('Get counter error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get counter'
    });
  }
});

// Create new counter
router.post('/', requireAdmin, validate(schemas.counterCreation), async (req, res) => {
  try {
    const { counter_no, counter_name, doctor_id, queue_limit } = req.body;

    // Check if counter number already exists for this vendor
    const existingCounter = await Counter.findOne({
      where: {
        vendor_id: req.user.vendor_id,
        counter_no
      }
    });

    if (existingCounter) {
      return res.status(409).json({
        success: false,
        message: 'Counter number already exists'
      });
    }

    // Verify doctor belongs to the same vendor if provided
    if (doctor_id) {
      const doctor = await User.findOne({
        where: {
          id: doctor_id,
          vendor_id: req.user.vendor_id
        }
      });

      if (!doctor) {
        return res.status(400).json({
          success: false,
          message: 'Doctor not found or does not belong to your vendor'
        });
      }
    }

    // Check vendor counter limits
    const vendor = await Vendor.findByPk(req.user.vendor_id, {
      include: [{
        model: require('../models').SubscriptionPlan,
        as: 'subscription',
        attributes: ['max_counters']
      }]
    });

    if (!vendor || !vendor.subscription) {
      return res.status(400).json({
        success: false,
        message: 'Vendor subscription not found'
      });
    }

    const currentCounterCount = await Counter.count({
      where: { vendor_id: req.user.vendor_id }
    });

    if (currentCounterCount >= vendor.subscription.max_counters) {
      return res.status(400).json({
        success: false,
        message: `Counter limit reached. Maximum allowed: ${vendor.subscription.max_counters}`
      });
    }

    // Create counter
    const counter = await Counter.create({
      vendor_id: req.user.vendor_id,
      counter_no,
      counter_name,
      doctor_id,
      queue_limit: queue_limit || 100,
      created_by: req.user.id,
      status: 'active'
    });

    // Get counter with relations
    const completeCounter = await Counter.findByPk(counter.id, {
      include: [
        {
          model: User,
          as: 'doctor',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Counter created successfully',
      data: completeCounter
    });

  } catch (error) {
    console.error('Create counter error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create counter'
    });
  }
});

// Update counter
router.put('/:counterId', requireAdmin, validate(schemas.counterUpdate), async (req, res) => {
  try {
    const { counterId } = req.params;
    const updateData = req.body;

    const counter = await Counter.findOne({
      where: {
        id: counterId,
        vendor_id: req.user.vendor_id
      }
    });

    if (!counter) {
      return res.status(404).json({
        success: false,
        message: 'Counter not found'
      });
    }

    // Check if counter number is already taken by another counter
    if (updateData.counter_no && updateData.counter_no !== counter.counter_no) {
      const existingCounter = await Counter.findOne({
        where: {
          vendor_id: req.user.vendor_id,
          counter_no: updateData.counter_no,
          id: { [Op.ne]: counterId }
        }
      });

      if (existingCounter) {
        return res.status(409).json({
          success: false,
          message: 'Counter number is already taken'
        });
      }
    }

    // Verify doctor belongs to the same vendor if provided
    if (updateData.doctor_id) {
      const doctor = await User.findOne({
        where: {
          id: updateData.doctor_id,
          vendor_id: req.user.vendor_id
        }
      });

      if (!doctor) {
        return res.status(400).json({
          success: false,
          message: 'Doctor not found or does not belong to your vendor'
        });
      }
    }

    await counter.update(updateData);

    // Get updated counter with relations
    const updatedCounter = await Counter.findByPk(counter.id, {
      include: [
        {
          model: User,
          as: 'doctor',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name']
        }
      ]
    });

    res.json({
      success: true,
      message: 'Counter updated successfully',
      data: updatedCounter
    });

  } catch (error) {
    console.error('Update counter error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update counter'
    });
  }
});

// Delete counter (soft delete)
router.delete('/:counterId', requireAdmin, async (req, res) => {
  try {
    const { counterId } = req.params;

    const counter = await Counter.findOne({
      where: {
        id: counterId,
        vendor_id: req.user.vendor_id
      }
    });

    if (!counter) {
      return res.status(404).json({
        success: false,
        message: 'Counter not found'
      });
    }

    // Check if counter has active queue entries
    const activeQueueCount = await QueueEntry.count({
      where: {
        counter_id: counterId,
        status: {
          [Op.in]: ['waiting', 'called', 'in_progress']
        }
      }
    });

    if (activeQueueCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete counter with active queue entries'
      });
    }

    await counter.destroy(); // Soft delete

    res.json({
      success: true,
      message: 'Counter deleted successfully'
    });

  } catch (error) {
    console.error('Delete counter error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete counter'
    });
  }
});

// Update counter status
router.patch('/:counterId/status', requireReceptionist, async (req, res) => {
  try {
    const { counterId } = req.params;
    const { status, message } = req.body;

    if (!['active', 'inactive', 'maintenance'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be active, inactive, or maintenance'
      });
    }

    const counter = await Counter.findOne({
      where: {
        id: counterId,
        vendor_id: req.user.vendor_id
      }
    });

    if (!counter) {
      return res.status(404).json({
        success: false,
        message: 'Counter not found'
      });
    }

    await counter.update({ status });

    // Emit real-time update
    req.io.to(`vendor_${req.user.vendor_id}`).emit('counter_status_update', {
      type: 'counter_status_update',
      data: {
        counter_id: counterId,
        status,
        message,
        updated_by: {
          id: req.user.id,
          name: req.user.name
        },
        timestamp: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Counter status updated successfully',
      data: {
        id: counter.id,
        status: counter.status
      }
    });

  } catch (error) {
    console.error('Update counter status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update counter status'
    });
  }
});

// Reset counter token numbers (useful for daily reset)
router.post('/:counterId/reset-tokens', requireAdmin, async (req, res) => {
  try {
    const { counterId } = req.params;

    const counter = await Counter.findOne({
      where: {
        id: counterId,
        vendor_id: req.user.vendor_id
      }
    });

    if (!counter) {
      return res.status(404).json({
        success: false,
        message: 'Counter not found'
      });
    }

    // Check if there are any active queue entries
    const activeQueueCount = await QueueEntry.count({
      where: {
        counter_id: counterId,
        status: {
          [Op.in]: ['waiting', 'called', 'in_progress']
        }
      }
    });

    if (activeQueueCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reset tokens while there are active queue entries'
      });
    }

    await counter.update({
      current_token_number: 0,
      last_token_called: 0
    });

    res.json({
      success: true,
      message: 'Counter token numbers reset successfully',
      data: {
        id: counter.id,
        current_token_number: counter.current_token_number,
        last_token_called: counter.last_token_called
      }
    });

  } catch (error) {
    console.error('Reset counter tokens error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset counter tokens'
    });
  }
});

// Get counter statistics
router.get('/:counterId/stats', async (req, res) => {
  try {
    const { counterId } = req.params;
    const { period = '30' } = req.query; // days

    const counter = await Counter.findOne({
      where: {
        id: counterId,
        vendor_id: req.user.vendor_id
      }
    });

    if (!counter) {
      return res.status(404).json({
        success: false,
        message: 'Counter not found'
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get basic statistics
    const stats = {
      total_tokens: await QueueEntry.count({
        where: {
          counter_id: counterId,
          created_at: {
            [Op.gte]: startDate
          }
        }
      }),
      completed_tokens: await QueueEntry.count({
        where: {
          counter_id: counterId,
          status: 'completed',
          created_at: {
            [Op.gte]: startDate
          }
        }
      }),
      cancelled_tokens: await QueueEntry.count({
        where: {
          counter_id: counterId,
          status: 'cancelled',
          created_at: {
            [Op.gte]: startDate
          }
        }
      }),
      no_show_tokens: await QueueEntry.count({
        where: {
          counter_id: counterId,
          status: 'no_show',
          created_at: {
            [Op.gte]: startDate
          }
        }
      })
    };

    // Calculate averages
    const averageServiceTime = await QueueEntry.findOne({
      where: {
        counter_id: counterId,
        status: 'completed',
        created_at: {
          [Op.gte]: startDate
        }
      },
      attributes: [
        [require('sequelize').fn('AVG', require('sequelize').literal('TIMESTAMPDIFF(MINUTE, started_at, completed_at)')), 'avg_service_time']
      ],
      raw: true
    });

    const averageWaitTime = await QueueEntry.findOne({
      where: {
        counter_id: counterId,
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
        counter,
        period_days: parseInt(period),
        statistics: {
          ...stats,
          completion_rate: stats.total_tokens > 0 ? ((stats.completed_tokens / stats.total_tokens) * 100).toFixed(2) : 0,
          average_service_time: Math.round(averageServiceTime?.avg_service_time || 0),
          average_wait_time: Math.round(averageWaitTime?.avg_wait_time || 0)
        }
      }
    });

  } catch (error) {
    console.error('Get counter stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get counter statistics'
    });
  }
});

module.exports = router;