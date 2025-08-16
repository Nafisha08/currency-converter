module.exports = (sequelize, DataTypes) => {
  const Item = sequelize.define('Item', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    vendor_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'vendors',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 150]
      }
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        len: [1, 50]
      }
    },
    sku: {
      type: DataTypes.STRING(50),
      allowNull: true,
      validate: {
        len: [1, 50]
      }
    },
    unit: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'pcs',
      validate: {
        len: [1, 20]
      }
    },
    tax_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: 0.00,
      validate: {
        min: 0,
        max: 100
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    stock_quantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0
      }
    },
    low_stock_threshold: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 10,
      validate: {
        min: 0
      }
    }
  }, {
    tableName: 'items',
    timestamps: true,
    paranoid: true,
    indexes: [
      {
        fields: ['vendor_id']
      },
      {
        fields: ['vendor_id', 'name'],
        unique: true
      },
      {
        fields: ['category']
      },
      {
        fields: ['is_active']
      },
      {
        fields: ['sku']
      }
    ]
  });

  Item.associate = function(models) {
    // Item belongs to a vendor
    Item.belongsTo(models.Vendor, {
      foreignKey: 'vendor_id',
      as: 'vendor'
    });

    // Item can be selected in counter item selections
    Item.hasMany(models.CounterItemSelection, {
      foreignKey: 'item_id',
      as: 'selections'
    });

    // Item can be in payment items
    Item.hasMany(models.PaymentItem, {
      foreignKey: 'item_id',
      as: 'paymentItems'
    });
  };

  return Item;
};