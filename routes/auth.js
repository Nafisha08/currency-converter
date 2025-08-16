const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User, Vendor, SubscriptionPlan } = require('../models');
const { validate, schemas } = require('../middleware/validation');
const { authRateLimit } = require('../middleware/auth');

const router = express.Router();

// User login
router.post('/login', authRateLimit, validate(schemas.userLogin), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user with vendor information
    const user = await User.findOne({
      where: { email: email.toLowerCase() },
      include: [{
        model: Vendor,
        as: 'vendor',
        include: [{
          model: SubscriptionPlan,
          as: 'subscription',
          attributes: ['id', 'name', 'max_users', 'max_counters', 'features']
        }]
      }]
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (!user.status) {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive. Please contact administrator.'
      });
    }

    // Check if vendor is active
    if (user.vendor && user.vendor.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Vendor account is not active. Please contact support.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        role: user.role,
        vendor_id: user.vendor_id
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );

    // Update last login
    await user.update({ last_login: new Date() });

    // Remove sensitive data
    const userData = user.toJSON();
    delete userData.password_hash;
    delete userData.reset_token;
    delete userData.reset_token_expires;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userData,
        token,
        expires_in: process.env.JWT_EXPIRE || '24h'
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
});

// Vendor registration (creates vendor + admin user)
router.post('/register/vendor', validate(schemas.vendorRegistration), async (req, res) => {
  try {
    const {
      name, business_name, gst_number, pincode, address, mobile, email,
      admin_name, admin_email, admin_password
    } = req.body;

    // Check if vendor with mobile already exists
    const existingVendor = await Vendor.findOne({ where: { mobile } });
    if (existingVendor) {
      return res.status(409).json({
        success: false,
        message: 'Vendor with this mobile number already exists'
      });
    }

    // Check if user with email already exists
    const existingUser = await User.findOne({ where: { email: admin_email.toLowerCase() } });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Get trial subscription plan
    const trialPlan = await SubscriptionPlan.findOne({
      where: { is_trial: true, is_active: true }
    });

    if (!trialPlan) {
      return res.status(400).json({
        success: false,
        message: 'No trial plan available. Please contact support.'
      });
    }

    // Create vendor
    const vendor = await Vendor.create({
      name,
      business_name,
      gst_number,
      pincode,
      address,
      mobile,
      email: email?.toLowerCase(),
      subscription_id: trialPlan.id,
      subscription_start_date: new Date(),
      subscription_end_date: new Date(Date.now() + trialPlan.duration_days * 24 * 60 * 60 * 1000),
      status: 'active'
    });

    // Create admin user
    const adminUser = await User.create({
      vendor_id: vendor.id,
      name: admin_name,
      email: admin_email.toLowerCase(),
      mobile,
      password_hash: admin_password, // Will be hashed by model hook
      role: 'admin',
      status: true
    });

    // Update vendor created_by
    await vendor.update({ created_by: adminUser.id });

    // Create subscription transaction record
    const { VendorSubscriptionTransaction } = require('../models');
    await VendorSubscriptionTransaction.create({
      vendor_id: vendor.id,
      subscription_id: trialPlan.id,
      type: 'trial',
      amount_paid: 0,
      start_date: vendor.subscription_start_date,
      end_date: vendor.subscription_end_date,
      payment_status: 'completed'
    });

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
        vendor_id: adminUser.vendor_id
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );

    // Get complete user data with vendor info
    const completeUser = await User.findByPk(adminUser.id, {
      include: [{
        model: Vendor,
        as: 'vendor',
        include: [{
          model: SubscriptionPlan,
          as: 'subscription'
        }]
      }],
      attributes: { exclude: ['password_hash'] }
    });

    res.status(201).json({
      success: true,
      message: 'Vendor registered successfully with trial subscription',
      data: {
        user: completeUser,
        vendor,
        token,
        expires_in: process.env.JWT_EXPIRE || '24h'
      }
    });

  } catch (error) {
    console.error('Vendor registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
});

// Password reset request
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await User.findOne({ where: { email: email.toLowerCase() } });
    
    if (!user) {
      // Don't reveal if email exists or not
      return res.json({
        success: true,
        message: 'If the email exists, a reset link has been sent'
      });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Save reset token to database
    await user.update({
      reset_token: resetToken,
      reset_token_expires: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    });

    // TODO: Send email with reset link
    // For now, just return the token (in production, this should be sent via email)
    
    res.json({
      success: true,
      message: 'If the email exists, a reset link has been sent',
      // Remove this in production:
      ...(process.env.NODE_ENV === 'development' && { reset_token: resetToken })
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process request'
    });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Verify reset token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findOne({
      where: { 
        id: decoded.id,
        reset_token: token,
        reset_token_expires: {
          [require('sequelize').Op.gt]: new Date()
        }
      }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Update password
    await user.update({
      password_hash: new_password, // Will be hashed by model hook
      reset_token: null,
      reset_token_expires: null
    });

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

// Verify token (for frontend to check if token is still valid)
router.get('/verify', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findByPk(decoded.id, {
      include: [{
        model: Vendor,
        as: 'vendor',
        include: [{
          model: SubscriptionPlan,
          as: 'subscription'
        }]
      }],
      attributes: { exclude: ['password_hash', 'reset_token', 'reset_token_expires'] }
    });

    if (!user || !user.status) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token or inactive user'
      });
    }

    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

module.exports = router;