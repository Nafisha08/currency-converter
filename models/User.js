const bcrypt = require('bcryptjs');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
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
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [2, 100]
      }
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
        notEmpty: true
      }
    },
    mobile: {
      type: DataTypes.STRING(15),
      allowNull: false,
      validate: {
        notEmpty: true,
        is: /^[+]?[1-9][\d]{9,14}$/
      }
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [6, 255]
      }
    },
    role: {
      type: DataTypes.ENUM('admin', 'user', 'receptionist'),
      allowNull: false,
      defaultValue: 'user'
    },
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true
    },
    reset_token: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    reset_token_expires: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'users',
    timestamps: true,
    paranoid: true,
    indexes: [
      {
        fields: ['email'],
        unique: true
      },
      {
        fields: ['vendor_id']
      },
      {
        fields: ['role']
      },
      {
        fields: ['status']
      }
    ],
    hooks: {
      beforeCreate: async (user) => {
        if (user.password_hash) {
          user.password_hash = await bcrypt.hash(user.password_hash, 12);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password_hash')) {
          user.password_hash = await bcrypt.hash(user.password_hash, 12);
        }
      }
    }
  });

  // Instance methods
  User.prototype.validatePassword = async function(password) {
    return await bcrypt.compare(password, this.password_hash);
  };

  User.prototype.isAdmin = function() {
    return this.role === 'admin';
  };

  User.prototype.isReceptionist = function() {
    return this.role === 'receptionist';
  };

  User.prototype.canManageCounters = function() {
    return ['admin', 'receptionist'].includes(this.role);
  };

  User.associate = function(models) {
    // User belongs to a vendor
    User.belongsTo(models.Vendor, {
      foreignKey: 'vendor_id',
      as: 'vendor'
    });

    // User can create counters
    User.hasMany(models.Counter, {
      foreignKey: 'created_by',
      as: 'createdCounters'
    });

    // User can be assigned to counters as doctor
    User.hasMany(models.Counter, {
      foreignKey: 'doctor_id',
      as: 'assignedCounters'
    });

    // User can make counter item selections
    User.hasMany(models.CounterItemSelection, {
      foreignKey: 'selected_by',
      as: 'itemSelections'
    });

    // User can process payments
    User.hasMany(models.Payment, {
      foreignKey: 'user_id',
      as: 'processedPayments'
    });

    // User can create vendors
    User.hasMany(models.Vendor, {
      foreignKey: 'created_by',
      as: 'createdVendors'
    });
  };

  return User;
};