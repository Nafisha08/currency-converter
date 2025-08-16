const { Sequelize } = require('sequelize');
const config = require('../config/database.js')[process.env.NODE_ENV || 'development'];

const sequelize = new Sequelize(config.database, config.username, config.password, config);

const db = {};

// Import all models
db.SubscriptionPlan = require('./SubscriptionPlan')(sequelize, Sequelize.DataTypes);
db.Vendor = require('./Vendor')(sequelize, Sequelize.DataTypes);
db.User = require('./User')(sequelize, Sequelize.DataTypes);
db.VendorSubscriptionTransaction = require('./VendorSubscriptionTransaction')(sequelize, Sequelize.DataTypes);
db.Counter = require('./Counter')(sequelize, Sequelize.DataTypes);
db.Item = require('./Item')(sequelize, Sequelize.DataTypes);
db.CounterItemSelection = require('./CounterItemSelection')(sequelize, Sequelize.DataTypes);
db.Payment = require('./Payment')(sequelize, Sequelize.DataTypes);
db.PaymentItem = require('./PaymentItem')(sequelize, Sequelize.DataTypes);
db.QueueEntry = require('./QueueEntry')(sequelize, Sequelize.DataTypes);

// Define associations
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;