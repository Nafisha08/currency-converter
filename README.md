# Queue Management System

A comprehensive multi-vendor queue management system with subscription-based access, real-time updates, and payment processing capabilities.

## 🚀 Features

### Core Features
- **Multi-Vendor Support**: Multiple vendors with isolated data and subscription management
- **Real-time Queue Management**: Live updates using Socket.IO for queue status and operations
- **Role-based Access Control**: Admin, User, and Receptionist roles with specific permissions
- **Subscription Management**: Trial and paid subscription plans with usage limits
- **Payment Processing**: Complete payment handling with item management and transaction history
- **Counter Management**: Multiple service counters per vendor with queue tracking
- **Analytics & Reporting**: Comprehensive statistics and performance metrics

### Technical Features
- **RESTful API**: Well-structured API endpoints with comprehensive validation
- **Real-time Communication**: Socket.IO for live updates and notifications
- **Database Design**: Normalized MySQL database with proper relationships
- **Security**: JWT authentication, input validation, rate limiting, and CORS protection
- **Scalability**: Modular architecture with proper separation of concerns

## 🏗️ Architecture

### Database Schema

The system includes 10 main tables:

1. **subscription_plans** - Master subscription plans (Free, Basic, Pro, etc.)
2. **vendors** - Vendor information with current subscription
3. **users** - Multi-role users (admin, user, receptionist) per vendor
4. **vendor_subscription_transactions** - Complete subscription history
5. **counters** - Service counters with queue management
6. **items** - Vendor's service/product catalog
7. **counter_item_selections** - Real-time item selection during service
8. **queue_entries** - Queue tokens with status tracking
9. **payments** - Payment transactions
10. **payment_items** - Detailed payment line items

### Key Relationships
- Vendors have current subscription + full transaction history
- Users belong to vendors with role-based permissions
- Counters belong to vendors and manage queues
- Queue entries track customer flow through counters
- Payments link to queue entries and break down by items

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MySQL with Sequelize ORM
- **Authentication**: JWT tokens
- **Real-time**: Socket.IO
- **Validation**: Joi schema validation
- **Security**: Helmet, CORS, Rate limiting
- **Logging**: Winston

## 📚 API Documentation

### Authentication Endpoints

#### POST `/api/auth/login`
User login with email and password.

```json
{
  "email": "admin@vendor.com",
  "password": "password123"
}
```

#### POST `/api/auth/register/vendor`
Register new vendor with admin user.

```json
{
  "name": "John Doe",
  "business_name": "ABC Clinic",
  "mobile": "+919876543210",
  "address": "123 Main Street",
  "pincode": "123456",
  "admin_name": "Dr. John",
  "admin_email": "admin@abc.com",
  "admin_password": "secure123"
}
```

### Queue Management Endpoints

#### POST `/api/queue/generate-token`
Generate new queue token.

```json
{
  "counter_id": "uuid",
  "customer_name": "Patient Name",
  "customer_mobile": "+919876543210",
  "priority": "normal"
}
```

#### POST `/api/queue/counter/:counterId/call-next`
Call next token in queue (requires receptionist role).

#### GET `/api/queue/dashboard`
Get live dashboard data with queue statistics.

### Payment Endpoints

#### POST `/api/payments`
Process payment transaction.

```json
{
  "counter_id": "uuid",
  "queue_entry_id": "uuid",
  "items": [
    {
      "item_id": "uuid",
      "quantity": 1,
      "unit_price": 100.00
    }
  ],
  "payment_mode": "cash",
  "customer_name": "John Doe"
}
```

#### GET `/api/payments/stats/summary`
Get payment statistics and revenue data.

### Vendor Management

#### GET `/api/vendors/profile`
Get vendor profile with subscription details.

#### GET `/api/vendors/analytics`
Get comprehensive analytics and performance metrics.

### Counter Management

#### POST `/api/counters`
Create new counter (requires admin role).

```json
{
  "counter_no": "C1",
  "counter_name": "General Consultation",
  "doctor_id": "uuid",
  "queue_limit": 50
}
```

#### PATCH `/api/counters/:counterId/status`
Update counter status (active/inactive/maintenance).

### Item Management

#### POST `/api/items`
Add new item to catalog.

```json
{
  "name": "Consultation Fee",
  "price": 500.00,
  "category": "Services",
  "tax_percentage": 18.0
}
```

## 🔧 Setup Instructions

### Prerequisites
- Node.js (v16+)
- MySQL (v8.0+)
- npm or yarn

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd queue-management-system
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your database and other configurations
```

4. **Setup database**
```bash
# Create MySQL database
mysql -u root -p
CREATE DATABASE queue_management_db;

# Run migrations (if using Sequelize CLI)
npm run migrate
```

5. **Start the server**
```bash
# Development
npm run dev

# Production
npm start
```

### Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=queue_management_db
DB_USER=root
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_super_secret_key
JWT_EXPIRE=24h

# Server
PORT=3000
NODE_ENV=development
```

## 📱 Real-time Features

### Socket.IO Events

The system provides real-time updates through Socket.IO:

#### Client Events
- `join_counter` - Join specific counter room
- `get_queue_status` - Request current queue status
- `broadcast_announcement` - Send announcements (admin/receptionist only)

#### Server Events
- `new_queue_entry` - New token generated
- `token_called` - Token called for service
- `service_started` - Service started for token
- `service_completed` - Service completed
- `payment_created` - New payment processed
- `counter_status_update` - Counter status changed

### Usage Example

```javascript
// Connect to socket
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Join vendor room automatically on connection
socket.on('connected', (data) => {
  console.log('Connected:', data.message);
});

// Listen for queue updates
socket.on('new_queue_entry', (data) => {
  console.log('New token generated:', data);
  // Update UI with new queue entry
});

// Join specific counter
socket.emit('join_counter', { counter_id: 'counter-uuid' });
```

## 🔐 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Role-based Access**: Different permission levels for different user roles
- **Input Validation**: Comprehensive request validation using Joi
- **Rate Limiting**: Protection against brute force attacks
- **CORS Configuration**: Controlled cross-origin requests
- **SQL Injection Protection**: Parameterized queries with Sequelize ORM
- **Password Hashing**: Bcrypt for secure password storage

## 📊 Key Features in Detail

### Subscription Management
- **Trial Subscriptions**: Automatic trial assignment for new vendors
- **Usage Limits**: User and counter limits based on subscription plans
- **Transaction History**: Complete audit trail of subscription changes
- **Automatic Expiry**: Built-in subscription expiry tracking

### Queue Management
- **Token Generation**: Sequential token numbering per counter per day
- **Priority Queues**: Support for normal, high, and emergency priorities
- **Real-time Updates**: Live queue status for all connected clients
- **Queue Limits**: Configurable maximum queue size per counter
- **Multi-status Tracking**: Waiting → Called → In Progress → Completed flow

### Payment System
- **Multiple Payment Modes**: Cash, Card, UPI, Wallet, Bank Transfer
- **Item-based Billing**: Detailed line items with tax and discount support
- **Automatic Calculations**: Tax, discount, and total calculations
- **Stock Management**: Optional inventory tracking with low-stock alerts
- **Refund Support**: Complete refund handling with stock restoration

### Analytics & Reporting
- **Real-time Dashboards**: Live statistics and performance metrics
- **Revenue Tracking**: Daily, weekly, monthly revenue reports
- **Queue Analytics**: Wait times, service times, completion rates
- **Top Items**: Best-selling services/products tracking
- **Counter Performance**: Individual counter statistics and efficiency metrics

## 🚀 Deployment

### Production Deployment

1. **Environment Setup**
```bash
NODE_ENV=production
# Set production database credentials
# Configure JWT secrets
# Set up HTTPS
```

2. **Database Optimization**
```bash
# Use connection pooling
# Enable query logging for optimization
# Set up database backups
```

3. **Process Management**
```bash
# Use PM2 for process management
npm install -g pm2
pm2 start ecosystem.config.js
```

4. **Reverse Proxy**
```nginx
# Nginx configuration for load balancing
upstream queue_api {
    server localhost:3000;
    server localhost:3001;
}

server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://queue_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🧪 Testing

### API Testing
```bash
# Install test dependencies
npm install --save-dev jest supertest

# Run tests
npm test
```

### Load Testing
```bash
# Use artillery for load testing
npm install -g artillery
artillery run load-test.yml
```

## 📈 Performance Considerations

- **Database Indexing**: Proper indexes on frequently queried columns
- **Connection Pooling**: Efficient database connection management
- **Caching**: Redis for session storage and frequently accessed data
- **Rate Limiting**: Prevents API abuse and ensures fair usage
- **Pagination**: All list endpoints support pagination
- **Real-time Optimization**: Efficient Socket.IO room management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation for common solutions

---

**Queue Management System** - Efficient, scalable, and feature-rich queue management for modern businesses.