const jwt = require('jsonwebtoken');
const { User, Vendor } = require('../models');

// Verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user with vendor information
    const user = await User.findByPk(decoded.id, {
      include: [{
        model: Vendor,
        as: 'vendor',
        attributes: ['id', 'name', 'business_name', 'status', 'subscription_id']
      }],
      attributes: { exclude: ['password_hash'] }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.'
      });
    }

    if (!user.status) {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive.'
      });
    }

    if (user.vendor && user.vendor.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Vendor account is not active.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired.'
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication.'
    });
  }
};

// Check if user has admin role
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
  next();
};

// Check if user has admin or receptionist role
const requireReceptionist = (req, res, next) => {
  if (!req.user || !['admin', 'receptionist'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Receptionist or admin privileges required.'
    });
  }
  next();
};

// Check if user belongs to the same vendor
const checkVendorAccess = (req, res, next) => {
  const vendorId = req.params.vendorId || req.body.vendor_id || req.query.vendor_id;
  
  if (!vendorId) {
    return res.status(400).json({
      success: false,
      message: 'Vendor ID is required.'
    });
  }

  if (req.user.vendor_id !== vendorId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only access your vendor data.'
    });
  }
  
  next();
};

// Check subscription status
const checkSubscription = async (req, res, next) => {
  try {
    const vendor = req.user.vendor;
    
    if (!vendor || !vendor.subscription_id) {
      return res.status(403).json({
        success: false,
        message: 'No active subscription found.'
      });
    }

    // Check if subscription is expired (this would need subscription end date)
    // You can add more subscription validation logic here
    
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking subscription status.'
    });
  }
};

// Rate limiting for authentication attempts
const authRateLimit = require('express-rate-limit')({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  verifyToken,
  requireAdmin,
  requireReceptionist,
  checkVendorAccess,
  checkSubscription,
  authRateLimit
};