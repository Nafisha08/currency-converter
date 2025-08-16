module.exports = (sequelize, DataTypes) => {
  const SubscriptionPlan = sequelize.define('SubscriptionPlan', {
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
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
      validate: {
        min: 0
      }
    },
    duration_days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    max_users: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1
      }
    },
    max_counters: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1
      }
    },
    features: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {}
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_trial: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'subscription_plans',
    timestamps: true,
    paranoid: true,
    indexes: [
      {
        fields: ['name'],
        unique: true
      },
      {
        fields: ['is_active']
      }
    ]
  });

  SubscriptionPlan.associate = function(models) {
    // A subscription plan can have many vendors
    SubscriptionPlan.hasMany(models.Vendor, {
      foreignKey: 'subscription_id',
      as: 'vendors'
    });

    // A subscription plan can have many subscription transactions
    SubscriptionPlan.hasMany(models.VendorSubscriptionTransaction, {
      foreignKey: 'subscription_id',
      as: 'transactions'
    });
  };

  return SubscriptionPlan;
};