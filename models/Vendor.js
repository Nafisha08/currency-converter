module.exports = (sequelize, DataTypes) => {
  const Vendor = sequelize.define('Vendor', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [2, 100]
      }
    },
    business_name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [2, 150]
      }
    },
    gst_number: {
      type: DataTypes.STRING(15),
      allowNull: true,
      validate: {
        is: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i // GST format validation
      }
    },
    pincode: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [6, 10]
      }
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [10, 500]
      }
    },
    mobile: {
      type: DataTypes.STRING(15),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        is: /^[+]?[1-9][\d]{9,14}$/ // Phone number validation
      }
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    subscription_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'subscription_plans',
        key: 'id'
      }
    },
    subscription_start_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    subscription_end_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'suspended'),
      defaultValue: 'active'
    }
  }, {
    tableName: 'vendors',
    timestamps: true,
    paranoid: true,
    indexes: [
      {
        fields: ['mobile'],
        unique: true
      },
      {
        fields: ['gst_number']
      },
      {
        fields: ['subscription_id']
      },
      {
        fields: ['status']
      }
    ]
  });

  Vendor.associate = function(models) {
    // Vendor belongs to a subscription plan
    Vendor.belongsTo(models.SubscriptionPlan, {
      foreignKey: 'subscription_id',
      as: 'subscription'
    });

    // Vendor can have many users
    Vendor.hasMany(models.User, {
      foreignKey: 'vendor_id',
      as: 'users'
    });

    // Vendor can have many counters
    Vendor.hasMany(models.Counter, {
      foreignKey: 'vendor_id',
      as: 'counters'
    });

    // Vendor can have many items
    Vendor.hasMany(models.Item, {
      foreignKey: 'vendor_id',
      as: 'items'
    });

    // Vendor can have many subscription transactions
    Vendor.hasMany(models.VendorSubscriptionTransaction, {
      foreignKey: 'vendor_id',
      as: 'subscriptionTransactions'
    });

    // Vendor can have many payments
    Vendor.hasMany(models.Payment, {
      foreignKey: 'vendor_id',
      as: 'payments'
    });

    // Vendor was created by a user
    Vendor.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator'
    });
  };

  return Vendor;
};