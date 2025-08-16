const express = require('express');
const { Op } = require('sequelize');
const { Payment, PaymentItem, Item, Counter, QueueEntry, User } = require('../models');
const { verifyToken, requireReceptionist } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

// Create new payment
router.post('/', requireReceptionist, validate(schemas.paymentCreation), async (req, res) => {
  try {
    const {
      counter_id, queue_entry_id, items, payment_mode, customer_name,
      customer_mobile, discount_amount = 0, notes
    } = req.body;

    // Verify counter belongs to vendor
    const counter = await Counter.findOne({
      where: {
        id: counter_id,
        vendor_id: req.user.vendor_id
      }
    });

    if (!counter) {
      return res.status(404).json({
        success: false,
        message: 'Counter not found'
      });
    }

    // Verify queue entry belongs to vendor if provided
    if (queue_entry_id) {
      const queueEntry = await QueueEntry.findOne({
        where: {
          id: queue_entry_id,
          vendor_id: req.user.vendor_id
        }
      });

      if (!queueEntry) {
        return res.status(404).json({
          success: false,
          message: 'Queue entry not found'
        });
      }
    }

    // Verify all items belong to vendor and calculate totals
    let totalAmount = 0;
    let totalTax = 0;
    const itemsData = [];

    for (const itemData of items) {
      const item = await Item.findOne({
        where: {
          id: itemData.item_id,
          vendor_id: req.user.vendor_id,
          is_active: true
        }
      });

      if (!item) {
        return res.status(404).json({
          success: false,
          message: `Item with ID ${itemData.item_id} not found or inactive`
        });
      }

      const unitPrice = itemData.unit_price || item.price;
      const lineTotal = itemData.quantity * unitPrice;
      const taxPercentage = itemData.tax_percentage || item.tax_percentage || 0;
      const discountPercentage = itemData.discount_percentage || 0;
      
      const lineTax = (lineTotal * taxPercentage) / 100;
      const lineDiscount = (lineTotal * discountPercentage) / 100;
      const lineNet = lineTotal + lineTax - lineDiscount;

      totalAmount += lineTotal;
      totalTax += lineTax;

      itemsData.push({
        item_id: item.id,
        quantity: itemData.quantity,
        unit_price: unitPrice,
        total_price: lineTotal,
        tax_percentage: taxPercentage,
        tax_amount: lineTax,
        discount_percentage: discountPercentage,
        discount_amount: lineDiscount,
        net_amount: lineNet,
        item_name: item.name
      });
    }

    // Create payment
    const payment = await Payment.create({
      vendor_id: req.user.vendor_id,
      counter_id,
      user_id: req.user.id,
      queue_entry_id,
      total_amount: totalAmount,
      tax_amount: totalTax,
      discount_amount,
      net_amount: totalAmount + totalTax - discount_amount,
      payment_mode,
      customer_name,
      customer_mobile,
      notes,
      status: 'completed',
      paid_at: new Date()
    });

    // Create payment items
    const paymentItems = await PaymentItem.bulkCreate(
      itemsData.map(item => ({
        payment_id: payment.id,
        ...item
      }))
    );

    // Update stock quantities if tracked
    for (const itemData of itemsData) {
      const item = await Item.findByPk(itemData.item_id);
      if (item.stock_quantity !== null) {
        await item.update({
          stock_quantity: Math.max(0, item.stock_quantity - itemData.quantity)
        });
      }
    }

    // Get complete payment with relations
    const completePayment = await Payment.findByPk(payment.id, {
      include: [
        {
          model: PaymentItem,
          as: 'items',
          include: [{
            model: Item,
            as: 'item',
            attributes: ['id', 'name', 'category', 'unit']
          }]
        },
        {
          model: Counter,
          as: 'counter',
          attributes: ['id', 'counter_no', 'counter_name']
        },
        {
          model: User,
          as: 'processedBy',
          attributes: ['id', 'name']
        },
        {
          model: QueueEntry,
          as: 'queueEntry',
          attributes: ['id', 'token_number', 'customer_name']
        }
      ]
    });

    // Emit real-time update
    req.io.to(`vendor_${req.user.vendor_id}`).emit('payment_created', {
      type: 'payment_created',
      data: completePayment
    });

    res.status(201).json({
      success: true,
      message: 'Payment processed successfully',
      data: completePayment
    });

  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process payment'
    });
  }
});

// Get payments for vendor
router.get('/', async (req, res) => {
  try {
    const {
      page = 1, limit = 50, status, payment_mode, counter_id,
      date_from, date_to, customer_mobile
    } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {
      vendor_id: req.user.vendor_id
    };

    if (status) {
      whereClause.status = status;
    }

    if (payment_mode) {
      whereClause.payment_mode = payment_mode;
    }

    if (counter_id) {
      whereClause.counter_id = counter_id;
    }

    if (customer_mobile) {
      whereClause.customer_mobile = { [Op.like]: `%${customer_mobile}%` };
    }

    if (date_from || date_to) {
      whereClause.paid_at = {};
      if (date_from) {
        whereClause.paid_at[Op.gte] = new Date(date_from);
      }
      if (date_to) {
        whereClause.paid_at[Op.lte] = new Date(date_to);
      }
    }

    const { count, rows: payments } = await Payment.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Counter,
          as: 'counter',
          attributes: ['id', 'counter_no', 'counter_name']
        },
        {
          model: User,
          as: 'processedBy',
          attributes: ['id', 'name']
        },
        {
          model: QueueEntry,
          as: 'queueEntry',
          attributes: ['id', 'token_number', 'customer_name']
        }
      ],
      order: [['paid_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        payments,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(count / limit),
          total_payments: count,
          per_page: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payments'
    });
  }
});

// Get payment by ID
router.get('/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findOne({
      where: {
        id: paymentId,
        vendor_id: req.user.vendor_id
      },
      include: [
        {
          model: PaymentItem,
          as: 'items',
          include: [{
            model: Item,
            as: 'item',
            attributes: ['id', 'name', 'category', 'unit', 'sku']
          }]
        },
        {
          model: Counter,
          as: 'counter',
          attributes: ['id', 'counter_no', 'counter_name']
        },
        {
          model: User,
          as: 'processedBy',
          attributes: ['id', 'name', 'role']
        },
        {
          model: QueueEntry,
          as: 'queueEntry',
          attributes: ['id', 'token_number', 'customer_name', 'customer_mobile']
        }
      ]
    });

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

  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment'
    });
  }
});

// Refund payment
router.post('/:paymentId/refund', requireReceptionist, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { reason, partial_amount } = req.body;

    const payment = await Payment.findOne({
      where: {
        id: paymentId,
        vendor_id: req.user.vendor_id
      },
      include: [{
        model: PaymentItem,
        as: 'items'
      }]
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    if (payment.status === 'refunded') {
      return res.status(400).json({
        success: false,
        message: 'Payment is already refunded'
      });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Only completed payments can be refunded'
      });
    }

    // Update payment status
    const refundAmount = partial_amount || payment.net_amount;
    
    await payment.update({
      status: 'refunded',
      notes: `${payment.notes || ''}\nRefunded: ${reason || 'No reason provided'}`.trim()
    });

    // Restore stock quantities if tracked
    for (const paymentItem of payment.items) {
      const item = await Item.findByPk(paymentItem.item_id);
      if (item && item.stock_quantity !== null) {
        await item.update({
          stock_quantity: item.stock_quantity + paymentItem.quantity
        });
      }
    }

    // Emit real-time update
    req.io.to(`vendor_${req.user.vendor_id}`).emit('payment_refunded', {
      type: 'payment_refunded',
      data: {
        payment_id: payment.id,
        refund_amount: refundAmount,
        reason
      }
    });

    res.json({
      success: true,
      message: 'Payment refunded successfully',
      data: {
        id: payment.id,
        status: payment.status,
        refund_amount: refundAmount
      }
    });

  } catch (error) {
    console.error('Refund payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refund payment'
    });
  }
});

// Get payment statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Overall statistics
    const totalPayments = await Payment.count({
      where: {
        vendor_id: req.user.vendor_id,
        status: 'completed',
        paid_at: {
          [Op.gte]: startDate
        }
      }
    });

    const totalRevenue = await Payment.sum('net_amount', {
      where: {
        vendor_id: req.user.vendor_id,
        status: 'completed',
        paid_at: {
          [Op.gte]: startDate
        }
      }
    });

    const totalRefunds = await Payment.count({
      where: {
        vendor_id: req.user.vendor_id,
        status: 'refunded',
        paid_at: {
          [Op.gte]: startDate
        }
      }
    });

    const refundAmount = await Payment.sum('net_amount', {
      where: {
        vendor_id: req.user.vendor_id,
        status: 'refunded',
        paid_at: {
          [Op.gte]: startDate
        }
      }
    });

    // Payment mode breakdown
    const paymentModeStats = await Payment.findAll({
      where: {
        vendor_id: req.user.vendor_id,
        status: 'completed',
        paid_at: {
          [Op.gte]: startDate
        }
      },
      attributes: [
        'payment_mode',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
        [require('sequelize').fn('SUM', require('sequelize').col('net_amount')), 'total_amount']
      ],
      group: ['payment_mode'],
      raw: true
    });

    // Daily revenue
    const dailyRevenue = await Payment.findAll({
      where: {
        vendor_id: req.user.vendor_id,
        status: 'completed',
        paid_at: {
          [Op.gte]: startDate
        }
      },
      attributes: [
        [require('sequelize').fn('DATE', require('sequelize').col('paid_at')), 'date'],
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'payment_count'],
        [require('sequelize').fn('SUM', require('sequelize').col('net_amount')), 'revenue']
      ],
      group: [require('sequelize').fn('DATE', require('sequelize').col('paid_at'))],
      order: [[require('sequelize').fn('DATE', require('sequelize').col('paid_at')), 'ASC']],
      raw: true
    });

    // Average transaction value
    const avgTransactionValue = totalPayments > 0 ? (totalRevenue / totalPayments) : 0;

    res.json({
      success: true,
      data: {
        period_days: parseInt(period),
        summary: {
          total_payments: totalPayments,
          total_revenue: parseFloat(totalRevenue || 0).toFixed(2),
          total_refunds: totalRefunds,
          refund_amount: parseFloat(refundAmount || 0).toFixed(2),
          net_revenue: parseFloat((totalRevenue || 0) - (refundAmount || 0)).toFixed(2),
          avg_transaction_value: parseFloat(avgTransactionValue).toFixed(2)
        },
        payment_mode_breakdown: paymentModeStats,
        daily_revenue: dailyRevenue
      }
    });

  } catch (error) {
    console.error('Get payment stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment statistics'
    });
  }
});

// Get top selling items
router.get('/stats/top-items', async (req, res) => {
  try {
    const { period = '30', limit = 10 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const topItems = await PaymentItem.findAll({
      include: [
        {
          model: Payment,
          as: 'payment',
          where: {
            vendor_id: req.user.vendor_id,
            status: 'completed',
            paid_at: {
              [Op.gte]: startDate
            }
          },
          attributes: []
        },
        {
          model: Item,
          as: 'item',
          attributes: ['id', 'name', 'category', 'unit', 'price']
        }
      ],
      attributes: [
        'item_id',
        [require('sequelize').fn('SUM', require('sequelize').col('quantity')), 'total_quantity'],
        [require('sequelize').fn('SUM', require('sequelize').col('net_amount')), 'total_revenue'],
        [require('sequelize').fn('COUNT', require('sequelize').col('PaymentItem.id')), 'transaction_count']
      ],
      group: ['item_id'],
      order: [[require('sequelize').fn('SUM', require('sequelize').col('quantity')), 'DESC']],
      limit: parseInt(limit),
      raw: false
    });

    res.json({
      success: true,
      data: {
        period_days: parseInt(period),
        top_items: topItems
      }
    });

  } catch (error) {
    console.error('Get top items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get top selling items'
    });
  }
});

module.exports = router;