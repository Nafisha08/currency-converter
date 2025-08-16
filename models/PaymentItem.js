module.exports = (sequelize, DataTypes) => {
  const PaymentItem = sequelize.define('PaymentItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    payment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'payments',
        key: 'id'
      }
    },
    item_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'items',
        key: 'id'
      }
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    unit_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0
      }
    },
    total_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0
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
    tax_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0.00,
      validate: {
        min: 0
      }
    },
    discount_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: 0.00,
      validate: {
        min: 0,
        max: 100
      }
    },
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0.00,
      validate: {
        min: 0
      }
    },
    net_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0
      }
    },
    item_name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'payment_items',
    timestamps: true,
    paranoid: true,
    indexes: [
      {
        fields: ['payment_id']
      },
      {
        fields: ['item_id']
      }
    ],
    hooks: {
      beforeSave: (paymentItem) => {
        // Auto-calculate total price
        paymentItem.total_price = (paymentItem.quantity * paymentItem.unit_price).toFixed(2);
        
        // Calculate tax amount if tax percentage is provided
        if (paymentItem.tax_percentage > 0) {
          paymentItem.tax_amount = (paymentItem.total_price * paymentItem.tax_percentage / 100).toFixed(2);
        }
        
        // Calculate discount amount if discount percentage is provided
        if (paymentItem.discount_percentage > 0) {
          paymentItem.discount_amount = (paymentItem.total_price * paymentItem.discount_percentage / 100).toFixed(2);
        }
        
        // Calculate net amount
        paymentItem.net_amount = (
          parseFloat(paymentItem.total_price) + 
          parseFloat(paymentItem.tax_amount || 0) - 
          parseFloat(paymentItem.discount_amount || 0)
        ).toFixed(2);
      }
    }
  });

  PaymentItem.associate = function(models) {
    // PaymentItem belongs to a payment
    PaymentItem.belongsTo(models.Payment, {
      foreignKey: 'payment_id',
      as: 'payment'
    });

    // PaymentItem belongs to an item
    PaymentItem.belongsTo(models.Item, {
      foreignKey: 'item_id',
      as: 'item'
    });
  };

  return PaymentItem;
};