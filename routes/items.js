const express = require('express');
const { Op } = require('sequelize');
const { Item, Vendor } = require('../models');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyToken);

// Get all items for vendor
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, category, is_active, search } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {
      vendor_id: req.user.vendor_id
    };

    if (category) {
      whereClause.category = category;
    }

    if (is_active !== undefined) {
      whereClause.is_active = is_active === 'true';
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        { sku: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows: items } = await Item.findAndCountAll({
      where: whereClause,
      order: [['name', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(count / limit),
          total_items: count,
          per_page: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get items'
    });
  }
});

// Get item by ID
router.get('/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;

    const item = await Item.findOne({
      where: {
        id: itemId,
        vendor_id: req.user.vendor_id
      },
      include: [{
        model: Vendor,
        as: 'vendor',
        attributes: ['id', 'name', 'business_name']
      }]
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    res.json({
      success: true,
      data: item
    });

  } catch (error) {
    console.error('Get item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get item'
    });
  }
});

// Create new item
router.post('/', requireAdmin, validate(schemas.itemCreation), async (req, res) => {
  try {
    const {
      name, price, description, category, sku, unit, tax_percentage,
      stock_quantity, low_stock_threshold
    } = req.body;

    // Check if item name already exists for this vendor
    const existingItem = await Item.findOne({
      where: {
        vendor_id: req.user.vendor_id,
        name
      }
    });

    if (existingItem) {
      return res.status(409).json({
        success: false,
        message: 'Item with this name already exists'
      });
    }

    // Check if SKU already exists for this vendor (if provided)
    if (sku) {
      const existingSKU = await Item.findOne({
        where: {
          vendor_id: req.user.vendor_id,
          sku
        }
      });

      if (existingSKU) {
        return res.status(409).json({
          success: false,
          message: 'Item with this SKU already exists'
        });
      }
    }

    const item = await Item.create({
      vendor_id: req.user.vendor_id,
      name,
      price,
      description,
      category,
      sku,
      unit: unit || 'pcs',
      tax_percentage: tax_percentage || 0,
      is_active: true,
      stock_quantity,
      low_stock_threshold: low_stock_threshold || 10
    });

    res.status(201).json({
      success: true,
      message: 'Item created successfully',
      data: item
    });

  } catch (error) {
    console.error('Create item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create item'
    });
  }
});

// Update item
router.put('/:itemId', requireAdmin, validate(schemas.itemUpdate), async (req, res) => {
  try {
    const { itemId } = req.params;
    const updateData = req.body;

    const item = await Item.findOne({
      where: {
        id: itemId,
        vendor_id: req.user.vendor_id
      }
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Check if item name is already taken by another item
    if (updateData.name && updateData.name !== item.name) {
      const existingItem = await Item.findOne({
        where: {
          vendor_id: req.user.vendor_id,
          name: updateData.name,
          id: { [Op.ne]: itemId }
        }
      });

      if (existingItem) {
        return res.status(409).json({
          success: false,
          message: 'Item name is already taken'
        });
      }
    }

    // Check if SKU is already taken by another item
    if (updateData.sku && updateData.sku !== item.sku) {
      const existingSKU = await Item.findOne({
        where: {
          vendor_id: req.user.vendor_id,
          sku: updateData.sku,
          id: { [Op.ne]: itemId }
        }
      });

      if (existingSKU) {
        return res.status(409).json({
          success: false,
          message: 'SKU is already taken'
        });
      }
    }

    await item.update(updateData);

    res.json({
      success: true,
      message: 'Item updated successfully',
      data: item
    });

  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update item'
    });
  }
});

// Delete item (soft delete)
router.delete('/:itemId', requireAdmin, async (req, res) => {
  try {
    const { itemId } = req.params;

    const item = await Item.findOne({
      where: {
        id: itemId,
        vendor_id: req.user.vendor_id
      }
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Check if item is used in any payments or selections
    const { PaymentItem } = require('../models');
    const usageCount = await PaymentItem.count({
      where: { item_id: itemId }
    });

    if (usageCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete item that has been used in transactions'
      });
    }

    await item.destroy(); // Soft delete

    res.json({
      success: true,
      message: 'Item deleted successfully'
    });

  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete item'
    });
  }
});

// Toggle item status
router.patch('/:itemId/toggle-status', requireAdmin, async (req, res) => {
  try {
    const { itemId } = req.params;

    const item = await Item.findOne({
      where: {
        id: itemId,
        vendor_id: req.user.vendor_id
      }
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    await item.update({
      is_active: !item.is_active
    });

    res.json({
      success: true,
      message: `Item ${item.is_active ? 'activated' : 'deactivated'} successfully`,
      data: {
        id: item.id,
        is_active: item.is_active
      }
    });

  } catch (error) {
    console.error('Toggle item status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle item status'
    });
  }
});

// Update item stock
router.patch('/:itemId/stock', requireAdmin, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { stock_quantity, operation = 'set' } = req.body;

    if (typeof stock_quantity !== 'number' || stock_quantity < 0) {
      return res.status(400).json({
        success: false,
        message: 'Stock quantity must be a non-negative number'
      });
    }

    const item = await Item.findOne({
      where: {
        id: itemId,
        vendor_id: req.user.vendor_id
      }
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    let newStock;
    switch (operation) {
      case 'add':
        newStock = (item.stock_quantity || 0) + stock_quantity;
        break;
      case 'subtract':
        newStock = Math.max(0, (item.stock_quantity || 0) - stock_quantity);
        break;
      case 'set':
      default:
        newStock = stock_quantity;
        break;
    }

    await item.update({ stock_quantity: newStock });

    res.json({
      success: true,
      message: 'Stock updated successfully',
      data: {
        id: item.id,
        stock_quantity: item.stock_quantity,
        is_low_stock: item.stock_quantity <= item.low_stock_threshold
      }
    });

  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update stock'
    });
  }
});

// Get item categories
router.get('/categories/list', async (req, res) => {
  try {
    const categories = await Item.findAll({
      where: {
        vendor_id: req.user.vendor_id,
        category: { [Op.ne]: null }
      },
      attributes: [
        'category',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      group: ['category'],
      order: [['category', 'ASC']],
      raw: true
    });

    res.json({
      success: true,
      data: categories
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get categories'
    });
  }
});

// Get low stock items
router.get('/low-stock/list', async (req, res) => {
  try {
    const lowStockItems = await Item.findAll({
      where: {
        vendor_id: req.user.vendor_id,
        is_active: true,
        stock_quantity: {
          [Op.lte]: require('sequelize').col('low_stock_threshold')
        }
      },
      order: [['stock_quantity', 'ASC']],
      limit: 50
    });

    res.json({
      success: true,
      data: lowStockItems
    });

  } catch (error) {
    console.error('Get low stock items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get low stock items'
    });
  }
});

module.exports = router;