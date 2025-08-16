const Joi = require('joi');

// Validation middleware
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    next();
  };
};

// Common validation schemas
const schemas = {
  // User validation schemas
  userRegistration: Joi.object({
    vendor_id: Joi.string().uuid().required(),
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    mobile: Joi.string().pattern(/^[+]?[1-9][\d]{9,14}$/).required(),
    password: Joi.string().min(6).max(50).required(),
    role: Joi.string().valid('admin', 'user', 'receptionist').default('user')
  }),

  userLogin: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  userUpdate: Joi.object({
    name: Joi.string().min(2).max(100),
    email: Joi.string().email(),
    mobile: Joi.string().pattern(/^[+]?[1-9][\d]{9,14}$/),
    role: Joi.string().valid('admin', 'user', 'receptionist'),
    status: Joi.boolean()
  }),

  // Vendor validation schemas
  vendorRegistration: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    business_name: Joi.string().min(2).max(150).required(),
    gst_number: Joi.string().pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i).optional(),
    pincode: Joi.string().min(6).max(10).required(),
    address: Joi.string().min(10).max(500).required(),
    mobile: Joi.string().pattern(/^[+]?[1-9][\d]{9,14}$/).required(),
    email: Joi.string().email().optional(),
    admin_name: Joi.string().min(2).max(100).required(),
    admin_email: Joi.string().email().required(),
    admin_password: Joi.string().min(6).max(50).required()
  }),

  vendorUpdate: Joi.object({
    name: Joi.string().min(2).max(100),
    business_name: Joi.string().min(2).max(150),
    gst_number: Joi.string().pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i),
    pincode: Joi.string().min(6).max(10),
    address: Joi.string().min(10).max(500),
    mobile: Joi.string().pattern(/^[+]?[1-9][\d]{9,14}$/),
    email: Joi.string().email(),
    status: Joi.string().valid('active', 'inactive', 'suspended')
  }),

  // Counter validation schemas
  counterCreation: Joi.object({
    counter_no: Joi.string().min(1).max(20).required(),
    counter_name: Joi.string().min(1).max(100).optional(),
    doctor_id: Joi.string().uuid().optional(),
    queue_limit: Joi.number().min(1).max(1000).default(100)
  }),

  counterUpdate: Joi.object({
    counter_no: Joi.string().min(1).max(20),
    counter_name: Joi.string().min(1).max(100),
    doctor_id: Joi.string().uuid().allow(null),
    status: Joi.string().valid('active', 'inactive', 'maintenance'),
    queue_limit: Joi.number().min(1).max(1000)
  }),

  // Item validation schemas
  itemCreation: Joi.object({
    name: Joi.string().min(1).max(150).required(),
    price: Joi.number().min(0).required(),
    description: Joi.string().max(1000).optional(),
    category: Joi.string().min(1).max(50).optional(),
    sku: Joi.string().min(1).max(50).optional(),
    unit: Joi.string().min(1).max(20).default('pcs'),
    tax_percentage: Joi.number().min(0).max(100).default(0),
    stock_quantity: Joi.number().min(0).optional(),
    low_stock_threshold: Joi.number().min(0).default(10)
  }),

  itemUpdate: Joi.object({
    name: Joi.string().min(1).max(150),
    price: Joi.number().min(0),
    description: Joi.string().max(1000),
    category: Joi.string().min(1).max(50),
    sku: Joi.string().min(1).max(50),
    unit: Joi.string().min(1).max(20),
    tax_percentage: Joi.number().min(0).max(100),
    is_active: Joi.boolean(),
    stock_quantity: Joi.number().min(0),
    low_stock_threshold: Joi.number().min(0)
  }),

  // Queue entry validation schemas
  queueEntryCreation: Joi.object({
    counter_id: Joi.string().uuid().required(),
    customer_name: Joi.string().min(1).max(100).optional(),
    customer_mobile: Joi.string().pattern(/^[+]?[1-9][\d]{9,14}$/).optional(),
    priority: Joi.string().valid('normal', 'high', 'emergency').default('normal'),
    service_type: Joi.string().min(1).max(100).optional(),
    notes: Joi.string().max(500).optional(),
    is_appointment: Joi.boolean().default(false),
    appointment_date: Joi.date().optional()
  }),

  queueEntryUpdate: Joi.object({
    customer_name: Joi.string().min(1).max(100),
    customer_mobile: Joi.string().pattern(/^[+]?[1-9][\d]{9,14}$/),
    priority: Joi.string().valid('normal', 'high', 'emergency'),
    status: Joi.string().valid('waiting', 'called', 'in_progress', 'completed', 'cancelled', 'no_show'),
    assigned_to: Joi.string().uuid().allow(null),
    service_type: Joi.string().min(1).max(100),
    notes: Joi.string().max(500),
    appointment_date: Joi.date()
  }),

  // Payment validation schemas
  paymentCreation: Joi.object({
    counter_id: Joi.string().uuid().required(),
    queue_entry_id: Joi.string().uuid().optional(),
    items: Joi.array().items(
      Joi.object({
        item_id: Joi.string().uuid().required(),
        quantity: Joi.number().min(1).required(),
        unit_price: Joi.number().min(0).required(),
        tax_percentage: Joi.number().min(0).max(100).default(0),
        discount_percentage: Joi.number().min(0).max(100).default(0)
      })
    ).min(1).required(),
    payment_mode: Joi.string().valid('cash', 'card', 'upi', 'wallet', 'bank_transfer').required(),
    customer_name: Joi.string().min(1).max(100).optional(),
    customer_mobile: Joi.string().pattern(/^[+]?[1-9][\d]{9,14}$/).optional(),
    discount_amount: Joi.number().min(0).default(0),
    notes: Joi.string().max(500).optional()
  }),

  // Subscription plan validation schemas
  subscriptionPlanCreation: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    price: Joi.number().min(0).required(),
    duration_days: Joi.number().min(1).required(),
    max_users: Joi.number().min(1).required(),
    max_counters: Joi.number().min(1).required(),
    features: Joi.object().optional(),
    is_trial: Joi.boolean().default(false)
  }),

  subscriptionPlanUpdate: Joi.object({
    name: Joi.string().min(2).max(100),
    price: Joi.number().min(0),
    duration_days: Joi.number().min(1),
    max_users: Joi.number().min(1),
    max_counters: Joi.number().min(1),
    features: Joi.object(),
    is_active: Joi.boolean(),
    is_trial: Joi.boolean()
  })
};

module.exports = {
  validate,
  schemas
};