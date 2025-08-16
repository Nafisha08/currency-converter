const express = require('express');
const { Op } = require('sequelize');
const { QueueEntry, Counter, Vendor, User, Payment } = require('../models');
const { verifyToken, checkVendorAccess, requireReceptionist } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

// Generate new queue token
router.post('/generate-token', validate(schemas.queueEntryCreation), async (req, res) => {
  try {
    const { counter_id, customer_name, customer_mobile, priority, service_type, notes, is_appointment, appointment_date } = req.body;

    // Get counter with vendor info
    const counter = await Counter.findByPk(counter_id, {
      include: [{
        model: Vendor,
        as: 'vendor',
        attributes: ['id', 'name', 'business_name']
      }]
    });

    if (!counter) {
      return res.status(404).json({
        success: false,
        message: 'Counter not found'
      });
    }

    // Check vendor access
    if (req.user.vendor_id !== counter.vendor_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only create tokens for your vendor counters.'
      });
    }

    if (counter.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Counter is not active'
      });
    }

    // Get current token number and increment
    const lastToken = await QueueEntry.findOne({
      where: {
        vendor_id: req.user.vendor_id,
        counter_id,
        created_at: {
          [Op.gte]: new Date().setHours(0, 0, 0, 0) // Today's entries
        }
      },
      order: [['token_number', 'DESC']]
    });

    const nextTokenNumber = lastToken ? lastToken.token_number + 1 : 1;

    // Check queue limit
    const currentQueueCount = await QueueEntry.count({
      where: {
        counter_id,
        status: {
          [Op.in]: ['waiting', 'called', 'in_progress']
        }
      }
    });

    if (currentQueueCount >= counter.queue_limit) {
      return res.status(400).json({
        success: false,
        message: `Queue is full. Maximum limit: ${counter.queue_limit}`
      });
    }

    // Create queue entry
    const queueEntry = await QueueEntry.create({
      vendor_id: req.user.vendor_id,
      counter_id,
      token_number: nextTokenNumber,
      customer_name,
      customer_mobile,
      priority: priority || 'normal',
      service_type,
      notes,
      is_appointment: is_appointment || false,
      appointment_date,
      created_by: req.user.id,
      status: 'waiting'
    });

    // Get complete queue entry with relations
    const completeQueueEntry = await QueueEntry.findByPk(queueEntry.id, {
      include: [
        {
          model: Counter,
          as: 'counter',
          attributes: ['id', 'counter_no', 'counter_name']
        },
        {
          model: User,
          as: 'createdBy',
          attributes: ['id', 'name', 'role']
        }
      ]
    });

    // Emit real-time update
    req.io.to(`vendor_${req.user.vendor_id}`).emit('new_queue_entry', {
      type: 'new_token',
      data: completeQueueEntry
    });

    // Update counter current token number
    await counter.update({ current_token_number: nextTokenNumber });

    res.status(201).json({
      success: true,
      message: 'Queue token generated successfully',
      data: completeQueueEntry
    });

  } catch (error) {
    console.error('Generate token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate token'
    });
  }
});

// Get queue status for a counter
router.get('/counter/:counterId/status', async (req, res) => {
  try {
    const { counterId } = req.params;

    // Get counter with vendor info
    const counter = await Counter.findByPk(counterId, {
      include: [{
        model: Vendor,
        as: 'vendor',
        attributes: ['id', 'name']
      }]
    });

    if (!counter) {
      return res.status(404).json({
        success: false,
        message: 'Counter not found'
      });
    }

    // Check vendor access
    if (req.user.vendor_id !== counter.vendor_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get current queue entries
    const queueEntries = await QueueEntry.findAll({
      where: {
        counter_id: counterId,
        status: {
          [Op.in]: ['waiting', 'called', 'in_progress']
        }
      },
      include: [
        {
          model: User,
          as: 'createdBy',
          attributes: ['id', 'name']
        },
        {
          model: User,
          as: 'assignedTo',
          attributes: ['id', 'name']
        }
      ],
      order: [
        ['priority', 'DESC'], // Emergency first, then high, then normal
        ['created_at', 'ASC']
      ]
    });

    // Get statistics
    const stats = {
      total_waiting: queueEntries.filter(entry => entry.status === 'waiting').length,
      total_called: queueEntries.filter(entry => entry.status === 'called').length,
      total_in_progress: queueEntries.filter(entry => entry.status === 'in_progress').length,
      current_token: counter.last_token_called || 0,
      next_token: queueEntries.find(entry => entry.status === 'waiting')?.token_number || null,
      last_updated: new Date()
    };

    res.json({
      success: true,
      data: {
        counter,
        queue_entries: queueEntries,
        statistics: stats
      }
    });

  } catch (error) {
    console.error('Get queue status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get queue status'
    });
  }
});

// Call next token
router.post('/counter/:counterId/call-next', requireReceptionist, async (req, res) => {
  try {
    const { counterId } = req.params;

    // Get counter
    const counter = await Counter.findByPk(counterId);
    if (!counter) {
      return res.status(404).json({
        success: false,
        message: 'Counter not found'
      });
    }

    // Check vendor access
    if (req.user.vendor_id !== counter.vendor_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get next waiting entry (prioritized by emergency, high, normal)
    const nextEntry = await QueueEntry.findOne({
      where: {
        counter_id: counterId,
        status: 'waiting'
      },
      order: [
        ['priority', 'DESC'], // Emergency first
        ['created_at', 'ASC'] // Then by time
      ]
    });

    if (!nextEntry) {
      return res.status(404).json({
        success: false,
        message: 'No waiting tokens found'
      });
    }

    // Update entry status to called
    await nextEntry.callNext();
    await nextEntry.update({ assigned_to: req.user.id });

    // Update counter
    await counter.update({ last_token_called: nextEntry.token_number });

    // Get updated entry with relations
    const updatedEntry = await QueueEntry.findByPk(nextEntry.id, {
      include: [
        {
          model: Counter,
          as: 'counter',
          attributes: ['id', 'counter_no', 'counter_name']
        },
        {
          model: User,
          as: 'assignedTo',
          attributes: ['id', 'name']
        }
      ]
    });

    // Emit real-time update
    req.io.to(`vendor_${req.user.vendor_id}`).emit('token_called', {
      type: 'token_called',
      data: updatedEntry
    });

    res.json({
      success: true,
      message: 'Token called successfully',
      data: updatedEntry
    });

  } catch (error) {
    console.error('Call next token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to call next token'
    });
  }
});

// Start service for a token
router.post('/entry/:entryId/start-service', requireReceptionist, async (req, res) => {
  try {
    const { entryId } = req.params;

    const queueEntry = await QueueEntry.findByPk(entryId, {
      include: [{
        model: Counter,
        as: 'counter'
      }]
    });

    if (!queueEntry) {
      return res.status(404).json({
        success: false,
        message: 'Queue entry not found'
      });
    }

    // Check vendor access
    if (req.user.vendor_id !== queueEntry.vendor_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (queueEntry.status !== 'called') {
      return res.status(400).json({
        success: false,
        message: 'Token must be called before starting service'
      });
    }

    // Start service
    await queueEntry.startService();
    await queueEntry.update({ assigned_to: req.user.id });

    // Emit real-time update
    req.io.to(`vendor_${req.user.vendor_id}`).emit('service_started', {
      type: 'service_started',
      data: queueEntry
    });

    res.json({
      success: true,
      message: 'Service started successfully',
      data: queueEntry
    });

  } catch (error) {
    console.error('Start service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start service'
    });
  }
});

// Complete service for a token
router.post('/entry/:entryId/complete-service', requireReceptionist, async (req, res) => {
  try {
    const { entryId } = req.params;

    const queueEntry = await QueueEntry.findByPk(entryId, {
      include: [{
        model: Counter,
        as: 'counter'
      }]
    });

    if (!queueEntry) {
      return res.status(404).json({
        success: false,
        message: 'Queue entry not found'
      });
    }

    // Check vendor access
    if (req.user.vendor_id !== queueEntry.vendor_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (queueEntry.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        message: 'Service must be in progress to complete'
      });
    }

    // Complete service
    await queueEntry.completeService();

    // Emit real-time update
    req.io.to(`vendor_${req.user.vendor_id}`).emit('service_completed', {
      type: 'service_completed',
      data: queueEntry
    });

    res.json({
      success: true,
      message: 'Service completed successfully',
      data: queueEntry
    });

  } catch (error) {
    console.error('Complete service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete service'
    });
  }
});

// Cancel a queue entry
router.post('/entry/:entryId/cancel', requireReceptionist, async (req, res) => {
  try {
    const { entryId } = req.params;
    const { reason } = req.body;

    const queueEntry = await QueueEntry.findByPk(entryId);

    if (!queueEntry) {
      return res.status(404).json({
        success: false,
        message: 'Queue entry not found'
      });
    }

    // Check vendor access
    if (req.user.vendor_id !== queueEntry.vendor_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (['completed', 'cancelled'].includes(queueEntry.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel completed or already cancelled entry'
      });
    }

    // Cancel entry
    await queueEntry.cancelEntry();
    if (reason) {
      await queueEntry.update({ notes: `${queueEntry.notes || ''}\nCancelled: ${reason}`.trim() });
    }

    // Emit real-time update
    req.io.to(`vendor_${req.user.vendor_id}`).emit('entry_cancelled', {
      type: 'entry_cancelled',
      data: queueEntry
    });

    res.json({
      success: true,
      message: 'Queue entry cancelled successfully',
      data: queueEntry
    });

  } catch (error) {
    console.error('Cancel entry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel entry'
    });
  }
});

// Get queue history
router.get('/history', async (req, res) => {
  try {
    const { page = 1, limit = 50, status, counter_id, date_from, date_to } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {
      vendor_id: req.user.vendor_id
    };

    if (status) {
      whereClause.status = status;
    }

    if (counter_id) {
      whereClause.counter_id = counter_id;
    }

    if (date_from || date_to) {
      whereClause.created_at = {};
      if (date_from) {
        whereClause.created_at[Op.gte] = new Date(date_from);
      }
      if (date_to) {
        whereClause.created_at[Op.lte] = new Date(date_to);
      }
    }

    const { count, rows: queueEntries } = await QueueEntry.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Counter,
          as: 'counter',
          attributes: ['id', 'counter_no', 'counter_name']
        },
        {
          model: User,
          as: 'createdBy',
          attributes: ['id', 'name']
        },
        {
          model: User,
          as: 'assignedTo',
          attributes: ['id', 'name']
        },
        {
          model: Payment,
          as: 'payments',
          attributes: ['id', 'total_amount', 'status', 'payment_mode']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        entries: queueEntries,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(count / limit),
          total_entries: count,
          per_page: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get queue history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get queue history'
    });
  }
});

// Get live queue dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    // Get all counters for the vendor
    const counters = await Counter.findAll({
      where: {
        vendor_id: req.user.vendor_id,
        status: 'active'
      },
      include: [
        {
          model: User,
          as: 'doctor',
          attributes: ['id', 'name']
        }
      ]
    });

    // Get today's statistics
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayStats = await QueueEntry.findAll({
      where: {
        vendor_id: req.user.vendor_id,
        created_at: {
          [Op.gte]: today
        }
      },
      attributes: [
        'status',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // Format statistics
    const statistics = {
      total_tokens_today: todayStats.reduce((sum, stat) => sum + parseInt(stat.count), 0),
      waiting: todayStats.find(s => s.status === 'waiting')?.count || 0,
      called: todayStats.find(s => s.status === 'called')?.count || 0,
      in_progress: todayStats.find(s => s.status === 'in_progress')?.count || 0,
      completed: todayStats.find(s => s.status === 'completed')?.count || 0,
      cancelled: todayStats.find(s => s.status === 'cancelled')?.count || 0
    };

    // Get current queue for each counter
    const counterQueues = await Promise.all(
      counters.map(async (counter) => {
        const currentQueue = await QueueEntry.findAll({
          where: {
            counter_id: counter.id,
            status: {
              [Op.in]: ['waiting', 'called', 'in_progress']
            }
          },
          order: [
            ['priority', 'DESC'],
            ['created_at', 'ASC']
          ],
          limit: 10 // Show next 10 in queue
        });

        return {
          counter,
          current_queue: currentQueue,
          queue_count: currentQueue.length
        };
      })
    );

    res.json({
      success: true,
      data: {
        statistics,
        counter_queues: counterQueues,
        last_updated: new Date()
      }
    });

  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard data'
    });
  }
});

module.exports = router;