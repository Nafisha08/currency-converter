const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('subscription_plans', [
      {
        id: uuidv4(),
        name: 'Trial',
        price: 0.00,
        duration_days: 30,
        max_users: 2,
        max_counters: 1,
        features: JSON.stringify({
          basic_queue_management: true,
          real_time_updates: true,
          basic_analytics: true,
          email_support: true
        }),
        is_active: true,
        is_trial: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Basic',
        price: 999.00,
        duration_days: 30,
        max_users: 5,
        max_counters: 3,
        features: JSON.stringify({
          basic_queue_management: true,
          real_time_updates: true,
          basic_analytics: true,
          advanced_analytics: true,
          payment_processing: true,
          inventory_management: true,
          email_support: true,
          phone_support: true
        }),
        is_active: true,
        is_trial: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Professional',
        price: 2499.00,
        duration_days: 30,
        max_users: 15,
        max_counters: 10,
        features: JSON.stringify({
          basic_queue_management: true,
          real_time_updates: true,
          basic_analytics: true,
          advanced_analytics: true,
          payment_processing: true,
          inventory_management: true,
          multi_location: true,
          custom_reports: true,
          api_access: true,
          email_support: true,
          phone_support: true,
          priority_support: true
        }),
        is_active: true,
        is_trial: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Enterprise',
        price: 4999.00,
        duration_days: 30,
        max_users: 50,
        max_counters: 25,
        features: JSON.stringify({
          basic_queue_management: true,
          real_time_updates: true,
          basic_analytics: true,
          advanced_analytics: true,
          payment_processing: true,
          inventory_management: true,
          multi_location: true,
          custom_reports: true,
          api_access: true,
          white_labeling: true,
          custom_integrations: true,
          dedicated_support: true,
          onsite_training: true,
          sla_guarantee: true
        }),
        is_active: true,
        is_trial: false,
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('subscription_plans', null, {});
  }
};