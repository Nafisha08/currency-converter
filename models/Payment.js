module.exports = (sequelize, DataTypes) => {
  const Payment = sequelize.define('Payment', {
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
    counter_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'counters',
        key: 'id'
      }
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    queue_entry_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'queue_entries',
        key: 'id'
      }
    },
    payment_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    total_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0
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
    payment_mode: {
      type: DataTypes.ENUM('cash', 'card', 'upi', 'wallet', 'bank_transfer'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded', 'cancelled'),
      defaultValue: 'pending'
    },
    paid_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    transaction_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    reference_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    customer_name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    customer_mobile: {
      type: DataTypes.STRING(15),
      allowNull: true,
      validate: {
        is: /^[+]?[1-9][\d]{9,14}$/
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'payments',
    timestamps: true,
    paranoid: true,
    indexes: [
      {
        fields: ['vendor_id']
      },
      {
        fields: ['counter_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['payment_number'],
        unique: true
      },
      {
        fields: ['status']
      },
      {
        fields: ['payment_mode']
      },
      {
        fields: ['paid_at']
      },
      {
        fields: ['transaction_id']
      }
    ],
    hooks: {
      beforeCreate: (payment) => {
        // Generate payment number if not provided
        if (!payment.payment_number) {
          const timestamp = Date.now();
          payment.payment_number = `PAY-${timestamp}`;
        }
        
        // Calculate net amount
        payment.net_amount = (
          parseFloat(payment.total_amount) + 
          parseFloat(payment.tax_amount || 0) - 
          parseFloat(payment.discount_amount || 0)
        ).toFixed(2);
      },
      beforeUpdate: (payment) => {
        // Recalculate net amount if relevant fields changed
        if (payment.changed('total_amount') || payment.changed('tax_amount') || payment.changed('discount_amount')) {
          payment.net_amount = (
            parseFloat(payment.total_amount) + 
            parseFloat(payment.tax_amount || 0) - 
            parseFloat(payment.discount_amount || 0)
          ).toFixed(2);
        }
      }
    }
  });

  Payment.associate = function(models) {
    // Payment belongs to a vendor
    Payment.belongsTo(models.Vendor, {
      foreignKey: 'vendor_id',
      as: 'vendor'
    });

    // Payment belongs to a counter
    Payment.belongsTo(models.Counter, {
      foreignKey: 'counter_id',
      as: 'counter'
    });

    // Payment was processed by a user
    Payment.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'processedBy'
    });

    // Payment can belong to a queue entry
    Payment.belongsTo(models.QueueEntry, {
      foreignKey: 'queue_entry_id',
      as: 'queueEntry'
    });

    // Payment can have many payment items
    Payment.hasMany(models.PaymentItem, {
      foreignKey: 'payment_id',
      as: 'items'
    });
  };

  return Payment;
};