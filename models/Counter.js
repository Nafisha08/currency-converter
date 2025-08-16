module.exports = (sequelize, DataTypes) => {
  const Counter = sequelize.define('Counter', {
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
    counter_no: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 20]
      }
    },
    counter_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      validate: {
        len: [1, 100]
      }
    },
    doctor_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'maintenance'),
      defaultValue: 'active'
    },
    current_token_number: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    last_token_called: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    queue_limit: {
      type: DataTypes.INTEGER,
      defaultValue: 100,
      validate: {
        min: 1,
        max: 1000
      }
    }
  }, {
    tableName: 'counters',
    timestamps: true,
    paranoid: true,
    indexes: [
      {
        fields: ['vendor_id', 'counter_no'],
        unique: true
      },
      {
        fields: ['vendor_id']
      },
      {
        fields: ['doctor_id']
      },
      {
        fields: ['status']
      }
    ]
  });

  Counter.associate = function(models) {
    // Counter belongs to a vendor
    Counter.belongsTo(models.Vendor, {
      foreignKey: 'vendor_id',
      as: 'vendor'
    });

    // Counter can be assigned to a doctor (user)
    Counter.belongsTo(models.User, {
      foreignKey: 'doctor_id',
      as: 'doctor'
    });

    // Counter was created by a user
    Counter.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator'
    });

    // Counter can have many item selections
    Counter.hasMany(models.CounterItemSelection, {
      foreignKey: 'counter_id',
      as: 'itemSelections'
    });

    // Counter can have many payments
    Counter.hasMany(models.Payment, {
      foreignKey: 'counter_id',
      as: 'payments'
    });

    // Counter can have many queue entries
    Counter.hasMany(models.QueueEntry, {
      foreignKey: 'counter_id',
      as: 'queueEntries'
    });
  };

  return Counter;
};