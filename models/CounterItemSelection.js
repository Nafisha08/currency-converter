module.exports = (sequelize, DataTypes) => {
  const CounterItemSelection = sequelize.define('CounterItemSelection', {
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
      defaultValue: 1,
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
    selected_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    selected_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    session_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'confirmed', 'cancelled'),
      defaultValue: 'pending'
    }
  }, {
    tableName: 'counter_item_selections',
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
        fields: ['item_id']
      },
      {
        fields: ['selected_by']
      },
      {
        fields: ['selected_at']
      },
      {
        fields: ['session_id']
      },
      {
        fields: ['status']
      }
    ],
    hooks: {
      beforeSave: (selection) => {
        // Auto-calculate total price
        selection.total_price = (selection.quantity * selection.unit_price).toFixed(2);
      }
    }
  });

  CounterItemSelection.associate = function(models) {
    // Selection belongs to a vendor
    CounterItemSelection.belongsTo(models.Vendor, {
      foreignKey: 'vendor_id',
      as: 'vendor'
    });

    // Selection belongs to a counter
    CounterItemSelection.belongsTo(models.Counter, {
      foreignKey: 'counter_id',
      as: 'counter'
    });

    // Selection belongs to an item
    CounterItemSelection.belongsTo(models.Item, {
      foreignKey: 'item_id',
      as: 'item'
    });

    // Selection was made by a user
    CounterItemSelection.belongsTo(models.User, {
      foreignKey: 'selected_by',
      as: 'selectedBy'
    });
  };

  return CounterItemSelection;
};