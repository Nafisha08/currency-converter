module.exports = (sequelize, DataTypes) => {
  const VendorSubscriptionTransaction = sequelize.define('VendorSubscriptionTransaction', {
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
    subscription_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'subscription_plans',
        key: 'id'
      }
    },
    type: {
      type: DataTypes.ENUM('trial', 'paid', 'renewal', 'upgrade', 'downgrade'),
      allowNull: false
    },
    amount_paid: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
      validate: {
        min: 0
      }
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    end_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    payment_status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded'),
      defaultValue: 'pending'
    },
    payment_method: {
      type: DataTypes.ENUM('cash', 'card', 'upi', 'bank_transfer', 'wallet'),
      allowNull: true
    },
    transaction_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'vendor_subscription_transactions',
    timestamps: true,
    paranoid: true,
    indexes: [
      {
        fields: ['vendor_id']
      },
      {
        fields: ['subscription_id']
      },
      {
        fields: ['type']
      },
      {
        fields: ['payment_status']
      },
      {
        fields: ['start_date', 'end_date']
      }
    ]
  });

  VendorSubscriptionTransaction.associate = function(models) {
    // Transaction belongs to a vendor
    VendorSubscriptionTransaction.belongsTo(models.Vendor, {
      foreignKey: 'vendor_id',
      as: 'vendor'
    });

    // Transaction belongs to a subscription plan
    VendorSubscriptionTransaction.belongsTo(models.SubscriptionPlan, {
      foreignKey: 'subscription_id',
      as: 'subscriptionPlan'
    });
  };

  return VendorSubscriptionTransaction;
};