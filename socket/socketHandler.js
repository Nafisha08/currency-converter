const jwt = require('jsonwebtoken');
const { User, Vendor } = require('../models');

const socketHandler = (io) => {
  // Middleware for socket authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await User.findByPk(decoded.id, {
        include: [{
          model: Vendor,
          as: 'vendor',
          attributes: ['id', 'name', 'business_name', 'status']
        }],
        attributes: { exclude: ['password_hash'] }
      });

      if (!user || !user.status) {
        return next(new Error('Authentication error: Invalid user'));
      }

      if (user.vendor && user.vendor.status !== 'active') {
        return next(new Error('Authentication error: Vendor not active'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.name} (${socket.user.email})`);

    // Join vendor room for real-time updates
    const vendorRoom = `vendor_${socket.user.vendor_id}`;
    socket.join(vendorRoom);
    
    // Join user-specific room
    const userRoom = `user_${socket.user.id}`;
    socket.join(userRoom);

    // Send welcome message with connection info
    socket.emit('connected', {
      message: 'Connected to Queue Management System',
      user: {
        id: socket.user.id,
        name: socket.user.name,
        role: socket.user.role,
        vendor: socket.user.vendor
      },
      rooms: [vendorRoom, userRoom]
    });

    // Handle joining specific counter room
    socket.on('join_counter', (data) => {
      try {
        const { counter_id } = data;
        
        if (!counter_id) {
          return socket.emit('error', { message: 'Counter ID is required' });
        }

        const counterRoom = `counter_${counter_id}`;
        socket.join(counterRoom);
        
        socket.emit('joined_counter', {
          message: `Joined counter ${counter_id}`,
          room: counterRoom
        });

        // Broadcast to vendor room that someone joined the counter
        socket.to(vendorRoom).emit('user_joined_counter', {
          user: {
            id: socket.user.id,
            name: socket.user.name,
            role: socket.user.role
          },
          counter_id
        });

      } catch (error) {
        console.error('Join counter error:', error);
        socket.emit('error', { message: 'Failed to join counter' });
      }
    });

    // Handle leaving specific counter room
    socket.on('leave_counter', (data) => {
      try {
        const { counter_id } = data;
        
        if (!counter_id) {
          return socket.emit('error', { message: 'Counter ID is required' });
        }

        const counterRoom = `counter_${counter_id}`;
        socket.leave(counterRoom);
        
        socket.emit('left_counter', {
          message: `Left counter ${counter_id}`,
          room: counterRoom
        });

        // Broadcast to vendor room that someone left the counter
        socket.to(vendorRoom).emit('user_left_counter', {
          user: {
            id: socket.user.id,
            name: socket.user.name,
            role: socket.user.role
          },
          counter_id
        });

      } catch (error) {
        console.error('Leave counter error:', error);
        socket.emit('error', { message: 'Failed to leave counter' });
      }
    });

    // Handle real-time queue status request
    socket.on('get_queue_status', async (data) => {
      try {
        const { counter_id } = data;
        
        if (!counter_id) {
          return socket.emit('error', { message: 'Counter ID is required' });
        }

        // This would typically call the same logic as the REST API
        // For now, just acknowledge the request
        socket.emit('queue_status_requested', {
          counter_id,
          timestamp: new Date()
        });

      } catch (error) {
        console.error('Get queue status error:', error);
        socket.emit('error', { message: 'Failed to get queue status' });
      }
    });

    // Handle manual queue updates (for staff to broadcast updates)
    socket.on('broadcast_announcement', (data) => {
      try {
        if (!['admin', 'receptionist'].includes(socket.user.role)) {
          return socket.emit('error', { message: 'Insufficient permissions' });
        }

        const { message, type = 'info', counter_id } = data;
        
        if (!message) {
          return socket.emit('error', { message: 'Message is required' });
        }

        const announcement = {
          type: 'announcement',
          data: {
            message,
            type,
            from_user: {
              id: socket.user.id,
              name: socket.user.name,
              role: socket.user.role
            },
            timestamp: new Date()
          }
        };

        if (counter_id) {
          // Broadcast to specific counter
          io.to(`counter_${counter_id}`).emit('announcement', announcement);
        } else {
          // Broadcast to entire vendor
          io.to(vendorRoom).emit('announcement', announcement);
        }

        socket.emit('announcement_sent', {
          message: 'Announcement broadcasted successfully'
        });

      } catch (error) {
        console.error('Broadcast announcement error:', error);
        socket.emit('error', { message: 'Failed to broadcast announcement' });
      }
    });

    // Handle counter status updates
    socket.on('update_counter_status', (data) => {
      try {
        if (!['admin', 'receptionist'].includes(socket.user.role)) {
          return socket.emit('error', { message: 'Insufficient permissions' });
        }

        const { counter_id, status, message } = data;
        
        if (!counter_id || !status) {
          return socket.emit('error', { message: 'Counter ID and status are required' });
        }

        // Broadcast counter status update
        io.to(vendorRoom).emit('counter_status_update', {
          type: 'counter_status_update',
          data: {
            counter_id,
            status,
            message,
            updated_by: {
              id: socket.user.id,
              name: socket.user.name,
              role: socket.user.role
            },
            timestamp: new Date()
          }
        });

      } catch (error) {
        console.error('Update counter status error:', error);
        socket.emit('error', { message: 'Failed to update counter status' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`User disconnected: ${socket.user.name} (${socket.user.email}) - Reason: ${reason}`);
      
      // Broadcast to vendor room that user disconnected
      socket.to(vendorRoom).emit('user_disconnected', {
        user: {
          id: socket.user.id,
          name: socket.user.name,
          role: socket.user.role
        },
        reason,
        timestamp: new Date()
      });
    });

    // Handle connection errors
    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      socket.emit('error', { message: 'Connection error occurred' });
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date() });
    });
  });

  // Helper function to broadcast queue updates to all relevant clients
  const broadcastQueueUpdate = (vendorId, counterId, eventType, data) => {
    const vendorRoom = `vendor_${vendorId}`;
    const counterRoom = `counter_${counterId}`;
    
    const updateData = {
      type: eventType,
      data,
      timestamp: new Date()
    };

    // Broadcast to vendor room
    io.to(vendorRoom).emit('queue_update', updateData);
    
    // Broadcast to specific counter room
    io.to(counterRoom).emit('queue_update', updateData);
  };

  // Helper function to get connected users count
  const getConnectedUsersCount = async (vendorId) => {
    const vendorRoom = `vendor_${vendorId}`;
    const sockets = await io.in(vendorRoom).fetchSockets();
    return sockets.length;
  };

  // Expose helper functions for use in other parts of the application
  io.broadcastQueueUpdate = broadcastQueueUpdate;
  io.getConnectedUsersCount = getConnectedUsersCount;

  return io;
};

module.exports = socketHandler;