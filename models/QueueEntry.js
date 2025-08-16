module.exports = (sequelize, DataTypes) => {
  const QueueEntry = sequelize.define('QueueEntry', {
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
    token_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
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
    priority: {
      type: DataTypes.ENUM('normal', 'high', 'emergency'),
      defaultValue: 'normal'
    },
    status: {
      type: DataTypes.ENUM('waiting', 'called', 'in_progress', 'completed', 'cancelled', 'no_show'),
      defaultValue: 'waiting'
    },
    estimated_wait_time: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Estimated wait time in minutes'
    },
    called_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    cancelled_at: {
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
    assigned_to: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    appointment_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    service_type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    is_appointment: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'queue_entries',
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
        fields: ['vendor_id', 'counter_id', 'token_number'],
        unique: true
      },
      {
        fields: ['status']
      },
      {
        fields: ['priority']
      },
      {
        fields: ['customer_mobile']
      },
      {
        fields: ['appointment_date']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  // Instance methods
  QueueEntry.prototype.callNext = function() {
    this.status = 'called';
    this.called_at = new Date();
    return this.save();
  };

  QueueEntry.prototype.startService = function() {
    this.status = 'in_progress';
    this.started_at = new Date();
    return this.save();
  };

  QueueEntry.prototype.completeService = function() {
    this.status = 'completed';
    this.completed_at = new Date();
    return this.save();
  };

  QueueEntry.prototype.cancelEntry = function() {
    this.status = 'cancelled';
    this.cancelled_at = new Date();
    return this.save();
  };

  QueueEntry.prototype.markNoShow = function() {
    this.status = 'no_show';
    return this.save();
  };

  QueueEntry.prototype.getWaitTime = function() {
    if (this.completed_at) {
      return Math.round((this.completed_at - this.created_at) / (1000 * 60)); // minutes
    }
    return Math.round((new Date() - this.created_at) / (1000 * 60)); // minutes
  };

  QueueEntry.associate = function(models) {
    // QueueEntry belongs to a vendor
    QueueEntry.belongsTo(models.Vendor, {
      foreignKey: 'vendor_id',
      as: 'vendor'
    });

    // QueueEntry belongs to a counter
    QueueEntry.belongsTo(models.Counter, {
      foreignKey: 'counter_id',
      as: 'counter'
    });

    // QueueEntry was created by a user
    QueueEntry.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'createdBy'
    });

    // QueueEntry can be assigned to a user
    QueueEntry.belongsTo(models.User, {
      foreignKey: 'assigned_to',
      as: 'assignedTo'
    });

    // QueueEntry can have payments
    QueueEntry.hasMany(models.Payment, {
      foreignKey: 'queue_entry_id',
      as: 'payments'
    });
  };

  return QueueEntry;
};