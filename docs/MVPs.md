# Proactive SaaS — Phase 1 Implementation Plan & Backend Architecture

> **Scope**: Phase 1 MVP — Auth, Users, RBAC, Clients, Services, Tasks, Invoicing, Receipts, Ledger, Settings  
> **Stack**: MongoDB · Express.js · React (Vite) · Node.js  
> **Decisions Applied**: Single billing entity · Manual client entry · User-count pricing

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Multi-Tenancy Strategy](#2-multi-tenancy-strategy)
3. [Database Schemas](#3-database-schemas)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [API Endpoints](#5-api-endpoints)
6. [Core Business Logic](#6-core-business-logic)
7. [Middleware Architecture](#7-middleware-architecture)
8. [Frontend Architecture Overview](#8-frontend-architecture-overview)
9. [Verification & Testing](#9-verification--testing)
10. [Phase 1 Task Breakdown](#10-phase-1-task-breakdown)

---

## 1. Project Structure

```
proactive/
├── server/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js                    # MongoDB connection with retry logic
│   │   │   ├── env.js                   # Environment variable validation
│   │   │   └── s3.js                    # S3-compatible storage client
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.js                  # JWT verification + user hydration
│   │   │   ├── authorize.js             # RBAC permission + SBAC scope check
│   │   │   ├── tenantScope.js           # Injects tenantId into req + validates isolation
│   │   │   ├── errorHandler.js          # Global error handler
│   │   │   ├── validate.js              # Joi/express-validator runner
│   │   │   ├── rateLimiter.js           # Per-tenant rate limiting
│   │   │   └── upload.js               # Multer + S3 streaming config
│   │   │
│   │   ├── models/
│   │   │   ├── Organization.js
│   │   │   ├── User.js
│   │   │   ├── Role.js
│   │   │   ├── Client.js
│   │   │   ├── Service.js
│   │   │   ├── Task.js
│   │   │   ├── Invoice.js
│   │   │   ├── Receipt.js
│   │   │   ├── BillingEntity.js
│   │   │   └── masters/
│   │   │       ├── Tag.js
│   │   │       ├── ClientGroup.js
│   │   │       ├── PaymentMode.js
│   │   │       ├── ExpenseCategory.js
│   │   │       ├── Holiday.js
│   │   │       └── DocumentType.js
│   │   │
│   │   ├── routes/
│   │   │   ├── index.js                 # Route aggregator
│   │   │   ├── auth.routes.js
│   │   │   ├── user.routes.js
│   │   │   ├── role.routes.js
│   │   │   ├── client.routes.js
│   │   │   ├── service.routes.js
│   │   │   ├── task.routes.js
│   │   │   ├── invoice.routes.js
│   │   │   ├── receipt.routes.js
│   │   │   ├── ledger.routes.js
│   │   │   ├── dashboard.routes.js
│   │   │   └── master.routes.js
│   │   │
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── user.controller.js
│   │   │   ├── role.controller.js
│   │   │   ├── client.controller.js
│   │   │   ├── service.controller.js
│   │   │   ├── task.controller.js
│   │   │   ├── invoice.controller.js
│   │   │   ├── receipt.controller.js
│   │   │   ├── ledger.controller.js
│   │   │   ├── dashboard.controller.js
│   │   │   └── master.controller.js
│   │   │
│   │   ├── services/                    # Business logic layer (heavy operations)
│   │   │   ├── auth.service.js          # Token generation, password hashing
│   │   │   ├── invoice.service.js       # Unbilled fetch, isBilled cascade, PDF
│   │   │   ├── receipt.service.js       # Settlement with MongoDB transactions
│   │   │   ├── ledger.service.js        # Running balance calculation
│   │   │   └── sequence.service.js      # Auto-increment invoice/receipt numbers
│   │   │
│   │   ├── validators/                  # Joi schemas for request validation
│   │   │   ├── auth.validator.js
│   │   │   ├── user.validator.js
│   │   │   ├── client.validator.js
│   │   │   ├── service.validator.js
│   │   │   ├── task.validator.js
│   │   │   ├── invoice.validator.js
│   │   │   └── receipt.validator.js
│   │   │
│   │   ├── utils/
│   │   │   ├── ApiError.js              # Custom error class with statusCode
│   │   │   ├── ApiResponse.js           # Standardized JSON response wrapper
│   │   │   ├── asyncHandler.js          # Async/await try-catch wrapper
│   │   │   ├── constants.js             # Enums, status codes, permission keys
│   │   │   └── pdf/
│   │   │       └── invoiceTemplate.js   # Invoice PDF generation (puppeteer/pdfkit)
│   │   │
│   │   ├── app.js                       # Express app setup (middleware, routes, error handler)
│   │   └── server.js                    # HTTP server + DB connection + graceful shutdown
│   │
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── fixtures/
│   │
│   ├── .env.example
│   ├── package.json
│   └── nodemon.json
│
├── client/                              # React (Vite) — Phase 1 frontend
│   ├── src/
│   │   ├── api/                         # Axios instances + endpoint functions
│   │   ├── components/                  # Reusable UI components
│   │   │   ├── layout/                  # TopBar, Sidebar, MainLayout
│   │   │   ├── ui/                      # DataTable, Modal, Form inputs, Skeleton
│   │   │   └── shared/                  # PermissionGate, AsyncSelect, StatusBadge
│   │   ├── contexts/                    # AuthContext, PermissionsContext, MastersContext
│   │   ├── hooks/                       # usePermissions, useDebounce, usePagination
│   │   ├── pages/                       # Route-level components
│   │   ├── utils/                       # Formatters, date helpers, validators
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
└── README.md
```

---

## 2. Multi-Tenancy Strategy

> [!CAUTION]
> This is the single most important architectural decision. Every query, every document, every API response **must** be tenant-scoped. A data leak between tenants is a company-ending event.

### Approach: Shared Database, Shared Collections, `tenantId` Field

We use a **single MongoDB database** with a `tenantId` field on every collection. This is the most cost-effective approach for early-stage SaaS and scales to thousands of tenants before needing sharding.

### Implementation

```javascript
// 1. Every Mongoose schema includes this field
{
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  }
}

// 2. Middleware extracts tenantId from JWT and injects it
// middleware/tenantScope.js
const tenantScope = (req, res, next) => {
  if (!req.user || !req.user.tenantId) {
    throw new ApiError(401, 'Tenant context missing');
  }
  req.tenantId = req.user.tenantId;
  next();
};

// 3. Every controller uses req.tenantId in queries
const getClients = async (req, res) => {
  const clients = await Client.find({ tenantId: req.tenantId, ...filters });
  // NEVER query without tenantId
};

// 4. Mongoose plugin to auto-inject tenantId on save
function tenantPlugin(schema) {
  schema.pre('save', function (next) {
    if (!this.tenantId) {
      return next(new Error('tenantId is required'));
    }
    next();
  });

  schema.pre(/^find/, function () {
    // Safety net: if tenantId not in query, throw
    if (!this.getQuery().tenantId) {
      throw new Error('Query missing tenantId — potential data leak');
    }
  });
}
```

### Compound Indexes

Every collection's primary query patterns include `tenantId`. All indexes must be compound:

```javascript
// Example: Tasks collection
taskSchema.index({ tenantId: 1, status: 1 });
taskSchema.index({ tenantId: 1, clientId: 1 });
taskSchema.index({ tenantId: 1, assignedUserId: 1, status: 1 });
taskSchema.index({ tenantId: 1, isBilled: 1, status: 1 });
```

---

## 3. Database Schemas

### 3.1. Organization (Tenant)

```javascript
const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, lowercase: true },  // URL-friendly identifier
  
  // Owner reference (the user who signed up)
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // SaaS Plan (Phase 5 enforcement, schema from day 1)
  plan: {
    type: { type: String, enum: ['free', 'starter', 'professional', 'enterprise'], default: 'free' },
    maxUsers: { type: Number, default: 2 },
    expiresAt: { type: Date },
    razorpaySubscriptionId: { type: String }
  },
  
  // Contact
  email: { type: String },
  phone: { type: String },
  address: { type: String },
  
  // Status
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

organizationSchema.index({ slug: 1 }, { unique: true });
```

---

### 3.2. User

> Requirement Ref: Module 2 (2.1, 2.2, 2.5)

```javascript
const userSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  // Identity
  name: { type: String, required: true, trim: true },
  username: { type: String, required: true, trim: true, lowercase: true },
  email: { type: String, trim: true, lowercase: true },
  mobile: { type: String },
  password: { type: String, required: true, select: false },  // Never sent to frontend
  
  // Profile
  photoUrl: { type: String, default: '' },
  
  // Access Control
  roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
  isActive: { type: Boolean, default: true },
  
  // Security — JWT Invalidation (Req 2.5 point 4)
  tokenVersion: { type: Number, default: 0 },
  
  // Refresh token storage (hashed)
  refreshToken: { type: String, select: false }
}, { timestamps: true });

// Compound unique: username unique per tenant, not globally
userSchema.index({ tenantId: 1, username: 1 }, { unique: true });
userSchema.index({ tenantId: 1, isActive: 1 });

// Password hashing hook (Req 2.2)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};
```

---

### 3.3. Role (RBAC + SBAC Engine)

> Requirement Ref: Module 2 (2.3, 2.4)

```javascript
const SCOPES = ['everything', 'assigned_only', 'team_only'];

// Permission sub-schema for each action
const permissionActionSchema = {
  allowed: { type: Boolean, default: false },
  scope: { type: String, enum: SCOPES, default: 'everything' }
};

const roleSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  name: { type: String, required: true, trim: true },
  description: { type: String },
  
  // Is this the immutable Super Admin role? (Req 2.5 point 2)
  isSuperAdmin: { type: Boolean, default: false },
  
  // The permission matrix (Req 2.4)
  permissions: {
    client: {
      create:              permissionActionSchema,
      edit:                permissionActionSchema,
      view:                permissionActionSchema,
      delete:              permissionActionSchema,
      viewLedger:          permissionActionSchema,
      manageClientPackages: permissionActionSchema,
      viewClientPackages:  permissionActionSchema
    },
    task: {
      create:              permissionActionSchema,
      edit:                permissionActionSchema,
      view:                permissionActionSchema,
      delete:              permissionActionSchema,
      verify:              permissionActionSchema,
      assignToOthers:      permissionActionSchema,
      manageTimeLog:       permissionActionSchema,
      deleteNote:          permissionActionSchema
    },
    invoice: {
      create:  permissionActionSchema,
      edit:    permissionActionSchema,
      view:    permissionActionSchema,
      delete:  permissionActionSchema
    },
    receipt: {
      create:  permissionActionSchema,
      edit:    permissionActionSchema,
      view:    permissionActionSchema,
      delete:  permissionActionSchema
    },
    quotation: {
      create:  permissionActionSchema,
      edit:    permissionActionSchema,
      view:    permissionActionSchema,
      delete:  permissionActionSchema
    },
    expense: {
      create:  permissionActionSchema,
      edit:    permissionActionSchema,
      view:    permissionActionSchema,
      delete:  permissionActionSchema
    },
    docsInOut: {
      create:  permissionActionSchema,
      edit:    permissionActionSchema,
      view:    permissionActionSchema,
      delete:  permissionActionSchema
    },
    dsc: {
      create:  permissionActionSchema,
      edit:    permissionActionSchema,
      view:    permissionActionSchema,
      delete:  permissionActionSchema
    },
    attendance: {
      markAttendance:     permissionActionSchema,
      markPastFuture:     permissionActionSchema
    },
    todo: {
      assignToOthers:     permissionActionSchema
    },
    settings: {
      manageMasters:      permissionActionSchema
    }
  }
}, { timestamps: true });

roleSchema.index({ tenantId: 1, name: 1 }, { unique: true });
```

---

### 3.4. Client

> Requirement Ref: Module 6 (6.1–6.5)

```javascript
const clientSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  // Basic Identity
  name: { type: String, required: true, trim: true },
  fileNo: { type: String, trim: true },
  entityType: {
    type: String,
    enum: [
      'Sole Proprietorship', 'Private Limited', 'Individual',
      'One Person Company', 'Partnership Firm', 'LLP',
      'Trust', 'NGO', 'HUF', 'Public Limited', 'Other'
    ]
  },
  
  // Contact
  email: { type: String, trim: true },
  mobile: { type: String },
  phone: { type: String },
  address: { type: String },
  city: { type: String },
  state: { type: String },
  pincode: { type: String },
  
  // Tax Identifiers
  pan: { type: String, uppercase: true, trim: true },
  gstin: { type: String, uppercase: true, trim: true },
  
  // Metadata / Classification
  photoUrl: { type: String, default: '' },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientGroup' },
  tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
  assignedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Dynamic Custom Fields (User confirmed: YES in Phase 1)
  // Definition stored at tenant level in TenantSettings
  // Values stored per-client as key-value map
  customFieldValues: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  
  // Service Subscriptions (Phase 2 auto-task cron reads this)
  subscribedServices: [{
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
    customPrice: { type: Number },
    customUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    subscribedAt: { type: Date, default: Date.now }
  }],
  
  // Package Subscriptions (Phase 2)
  subscribedPackages: [{
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package' },
    customPrice: { type: Number },
    subscribedAt: { type: Date, default: Date.now }
  }],
  
  // Automation Toggles (Phase 4 reads these)
  autoInvoice: { type: Boolean, default: false },
  allowNotifications: { type: Boolean, default: true },
  allowLogin: { type: Boolean, default: false },  // Phase 5: client portal access
  
  // Status
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

clientSchema.index({ tenantId: 1, name: 1 });
clientSchema.index({ tenantId: 1, fileNo: 1 });
clientSchema.index({ tenantId: 1, entityType: 1 });
clientSchema.index({ tenantId: 1, 'tags': 1 });
clientSchema.index({ tenantId: 1, 'assignedUsers': 1 });
clientSchema.index({ tenantId: 1, gstin: 1 });
clientSchema.index({ tenantId: 1, pan: 1 });
```

---

### 3.5. Service

> Requirement Ref: Module 4 (4.1–4.6)

```javascript
const serviceSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  // Basic
  name: { type: String, required: true, trim: true },
  isEnabled: { type: Boolean, default: true },
  
  // Recurrence Configuration (Phase 2 cron reads these)
  isRecurring: { type: Boolean, default: false },
  frequency: {
    type: { type: String, enum: ['monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time'] },
    creationDay: { type: Number, min: 1, max: 28 },  // Day of month task is created
    dueDay: { type: Number, min: 1, max: 28 },       // Day of month task is due
    periodLogic: {
      type: String,
      enum: ['recently_completed', 'currently_running'],
      default: 'recently_completed'
    }
  },
  
  // Assignment Logic
  assignmentMode: {
    type: String,
    enum: ['client_default_user', 'specific_users'],
    default: 'client_default_user'
  },
  assignedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Billing Settings
  sacCode: { type: String },
  gstPercentage: { type: Number, default: 18 },
  defaultBillingRate: { type: Number, default: 0 },
  isBillable: { type: Boolean, default: true },
  
  // Checklist (SOP steps) — Req 4.3
  checklist: [{
    stepName: { type: String, required: true },
    orderIndex: { type: Number, required: true }
  }],
  
  // Subtasks (Phase 2)
  subtasks: [{
    title: { type: String },
    description: { type: String },
    relativeDueDays: { type: Number },  // Days after task creation
    assignedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  
  // Custom Field Definitions (Phase 2 — schema stored, UI deferred)
  customFieldsDef: [{
    label: { type: String, required: true },
    fieldType: { type: String, enum: ['text', 'number', 'select', 'date'], required: true },
    options: [{ type: String }],  // Only for 'select' type
    isRequired: { type: Boolean, default: false }
  }],
  
  // Checklist completion requirement (Req 4.2)
  isChecklistRequired: { type: Boolean, default: false },
  
  // GST API Config (Phase 3+)
  gstApiConfig: {
    isEnabled: { type: Boolean, default: false },
    returnType: { type: String }
  },
  
  // Document Collection toggle (Phase 3+)
  autoDocCollection: {
    isEnabled: { type: Boolean, default: false },
    defaultMessage: { type: String }
  }
}, { timestamps: true });

serviceSchema.index({ tenantId: 1, isEnabled: 1 });
serviceSchema.index({ tenantId: 1, isRecurring: 1, isEnabled: 1 });
serviceSchema.index({ tenantId: 1, name: 1 });
```

---

### 3.6. Task

> Requirement Ref: Module 3 (3.1, 3.2)

```javascript
const TASK_STATUSES = ['Pending', 'In Progress', 'Under Review', 'On Hold', 'Completed', 'Cancelled'];

const taskSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  // References
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
  assignedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Task Details
  title: { type: String, required: true, trim: true },
  description: { type: String },
  status: { type: String, enum: TASK_STATUSES, default: 'Pending' },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
  
  // Period (Req 3.2 point 3 — separate from dueDate)
  period: {
    month: { type: Number, min: 1, max: 12 },
    year: { type: Number },
    label: { type: String }  // "Jan 2026", "Q1 2026"
  },
  
  // Dates
  dueDate: { type: Date },
  completedAt: { type: Date },
  
  // Creation context
  creationType: { type: String, enum: ['manual', 'automated'], default: 'manual' },
  
  // Checklist (inherited from Service, tracked per task)
  checklist: [{
    stepName: { type: String },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  
  // Subtasks (Phase 2)
  subtasks: [{
    title: { type: String },
    description: { type: String },
    assignedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dueDate: { type: Date },
    status: { type: String, enum: TASK_STATUSES, default: 'Pending' }
  }],
  
  // Custom Field Values (Phase 2 — schema from day 1)
  customFieldValues: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  
  // Notes / Activity Log
  notes: [{
    content: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Financial
  isBilled: { type: Boolean, default: false },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  billingAmount: { type: Number, default: 0 },
  
  // Time Tracking (Phase 5 — schema from day 1)
  timeLogged: { type: Number, default: 0 },  // Total minutes
  timeLogs: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    minutes: { type: Number },
    description: { type: String },
    loggedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

taskSchema.index({ tenantId: 1, status: 1 });
taskSchema.index({ tenantId: 1, clientId: 1, status: 1 });
taskSchema.index({ tenantId: 1, assignedUserId: 1, status: 1 });
taskSchema.index({ tenantId: 1, isBilled: 1, status: 1 });
taskSchema.index({ tenantId: 1, serviceId: 1, clientId: 1, 'period.month': 1, 'period.year': 1 });
taskSchema.index({ tenantId: 1, dueDate: 1 });
```

---

### 3.7. Invoice

> Requirement Ref: Module 7 (7.1)

```javascript
const invoiceSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  // References
  billingEntityId: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingEntity' },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  
  // Invoice Identity
  invoiceNo: { type: String, required: true },
  date: { type: Date, required: true },
  dueDate: { type: Date },
  paymentTerms: { type: String },  // "Net 15", "Due on Receipt"
  
  // Line Items
  items: [{
    referenceType: { type: String, enum: ['Task', 'Expense', 'Manual'] },
    referenceId: { type: mongoose.Schema.Types.ObjectId },
    particulars: { type: String, required: true },
    sacCode: { type: String },
    quantity: { type: Number, default: 1 },
    rate: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    taxableAmount: { type: Number },
    gstPercentage: { type: Number, default: 18 },
    gstAmount: { type: Number },
    total: { type: Number, required: true }
  }],
  
  // Totals
  totals: {
    subtotal: { type: Number, required: true },
    totalDiscount: { type: Number, default: 0 },
    totalTaxable: { type: Number },
    totalGst: { type: Number },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    amountDue: { type: Number, required: true }
  },
  
  // Status
  status: {
    type: String,
    enum: ['Draft', 'Unpaid', 'Partially Paid', 'Paid', 'Cancelled'],
    default: 'Unpaid'
  },
  
  // Notes
  notes: { type: String },
  termsAndConditions: { type: String },
  
  // PDF
  pdfUrl: { type: String },
  
  // Credit Notes (Phase 3)
  creditNoteIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CreditNote' }]
}, { timestamps: true });

invoiceSchema.index({ tenantId: 1, invoiceNo: 1 }, { unique: true });
invoiceSchema.index({ tenantId: 1, clientId: 1, status: 1 });
invoiceSchema.index({ tenantId: 1, status: 1 });
invoiceSchema.index({ tenantId: 1, date: -1 });

// POST SAVE HOOK: Mark referenced tasks/expenses as billed (Req 7.1)
invoiceSchema.post('save', async function (doc) {
  if (doc.status !== 'Draft' && doc.status !== 'Cancelled') {
    const taskIds = doc.items
      .filter(i => i.referenceType === 'Task' && i.referenceId)
      .map(i => i.referenceId);
    
    if (taskIds.length > 0) {
      await mongoose.model('Task').updateMany(
        { _id: { $in: taskIds } },
        { $set: { isBilled: true, invoiceId: doc._id } }
      );
    }
  }
});
```

---

### 3.8. Receipt

> Requirement Ref: Module 7 (7.2)

```javascript
const receiptSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  // References
  billingEntityId: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingEntity' },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  
  // Receipt Identity
  receiptNo: { type: String, required: true },
  date: { type: Date, required: true },
  
  // Payment Details
  paymentMode: { type: String, required: true },  // From PaymentMode master
  receivedAmount: { type: Number, required: true },
  tdsAmount: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },  // received + tds + discount
  
  // Settlement Breakdown — which invoices were settled and by how much
  settlements: [{
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    invoiceNo: { type: String },
    settledAmount: { type: Number, required: true }
  }],
  
  // Notes
  notes: { type: String },
  
  // PDF
  pdfUrl: { type: String }
}, { timestamps: true });

receiptSchema.index({ tenantId: 1, receiptNo: 1 }, { unique: true });
receiptSchema.index({ tenantId: 1, clientId: 1 });
receiptSchema.index({ tenantId: 1, date: -1 });
```

---

### 3.9. BillingEntity

> Requirement Ref: Module 12 (12.2) — Single entity in Phase 1

```javascript
const billingEntitySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  name: { type: String, required: true },
  gstin: { type: String },
  pan: { type: String },
  address: { type: String },
  
  // Brand Assets
  logoUrl: { type: String },
  signatureUrl: { type: String },
  
  // Invoice Sequencing
  invoicePrefix: { type: String, default: 'INV-' },
  invoiceNextNumber: { type: Number, default: 1 },
  receiptPrefix: { type: String, default: 'RCT-' },
  receiptNextNumber: { type: Number, default: 1 },
  
  // Footer
  termsAndConditions: { type: String },
  
  // UPI (Phase 5)
  upiId: { type: String },
  
  isPrimary: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

billingEntitySchema.index({ tenantId: 1 });
```

---

### 3.10. Master Collections

> Requirement Ref: Module 12 (12.1), Module 13 (13.1–13.3)

All master collections share the same lightweight pattern:

```javascript
// --- Tag ---
const tagSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  color: { type: String, default: '#3B82F6' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
tagSchema.index({ tenantId: 1, name: 1 }, { unique: true });

// --- ClientGroup ---
const clientGroupSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
clientGroupSchema.index({ tenantId: 1, name: 1 }, { unique: true });

// --- PaymentMode ---
const paymentModeSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
paymentModeSchema.index({ tenantId: 1, name: 1 }, { unique: true });

// --- ExpenseCategory ---
const expenseCategorySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
expenseCategorySchema.index({ tenantId: 1, name: 1 }, { unique: true });

// --- Holiday ---
const holidaySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  date: { type: String, required: true },  // YYYY-MM-DD
  eventName: { type: String, required: true }
}, { timestamps: true });
holidaySchema.index({ tenantId: 1, date: 1 }, { unique: true });

// --- DocumentType ---
const documentTypeSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
documentTypeSchema.index({ tenantId: 1, name: 1 }, { unique: true });
```

---

### 3.11. TenantSettings (Global Configuration)

> Requirement Ref: Module 13 (13.1–13.5)

```javascript
const tenantSettingsSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true },
  
  // Client Custom Field Definitions (Phase 1 — confirmed by user)
  clientCustomFields: [{
    label: { type: String, required: true },
    fieldType: { type: String, enum: ['text', 'number', 'select', 'date', 'email', 'phone'], required: true },
    options: [{ type: String }],  // For 'select' type
    isRequired: { type: Boolean, default: false },
    orderIndex: { type: Number, default: 0 }
  }],
  
  // Attendance Config (Phase 2)
  attendance: {
    weekendDays: { type: [Number], default: [0] },  // 0=Sunday
    workingHoursPerDay: { type: Number, default: 8 },
    overtimeThreshold: { type: Number, default: 480 }  // minutes
  },
  
  // Notification Config (Phase 4)
  notifications: {
    emailEnabled: { type: Boolean, default: false },
    smsEnabled: { type: Boolean, default: false },
    whatsappEnabled: { type: Boolean, default: false }
  },
  
  // Misc
  allowDuplicateClientNames: { type: Boolean, default: false },
  defaultGstPercentage: { type: Number, default: 18 },
  financialYearStart: { type: Number, default: 4 }  // April
}, { timestamps: true });
```

---

## 4. Authentication & Authorization

### 4.1. Auth Flow

```mermaid
sequenceDiagram
    participant Browser
    participant Express
    participant MongoDB

    Note over Browser,MongoDB: --- Organization Signup ---
    Browser->>Express: POST /api/v1/auth/register<br/>{orgName, name, username, password, email}
    Express->>MongoDB: Create Organization doc
    Express->>MongoDB: Create "Super Admin" Role (isSuperAdmin: true, all permissions)
    Express->>MongoDB: Create User doc (roleId: SuperAdmin)
    Express->>MongoDB: Create default BillingEntity
    Express->>MongoDB: Create TenantSettings doc
    Express-->>Browser: { accessToken, refreshToken, user, organization }

    Note over Browser,MongoDB: --- Login ---
    Browser->>Express: POST /api/v1/auth/login<br/>{username, password, orgSlug}
    Express->>MongoDB: Find org by slug → Find user by username + tenantId
    Express->>Express: Verify password (bcrypt)
    Express->>Express: Check user.isActive === true
    Express->>Express: Generate JWT (payload: userId, tenantId, roleId, tokenVersion)
    Express->>MongoDB: Save hashed refreshToken on User doc
    Express-->>Browser: { accessToken (15min), refreshToken (7d) }

    Note over Browser,MongoDB: --- Authenticated Request ---
    Browser->>Express: GET /api/v1/clients (Authorization: Bearer <accessToken>)
    Express->>Express: auth middleware: verify JWT, extract userId + tenantId
    Express->>MongoDB: Find User by id, populate Role
    Express->>Express: Check user.isActive && tokenVersion matches JWT
    Express->>Express: tenantScope middleware: inject req.tenantId
    Express->>Express: authorize('client', 'view') middleware
    Express->>MongoDB: Client.find({ tenantId: req.tenantId, ...scopeFilters })
    Express-->>Browser: { success: true, data: [...clients] }

    Note over Browser,MongoDB: --- Token Refresh ---
    Browser->>Express: POST /api/v1/auth/refresh<br/>{refreshToken}
    Express->>Express: Verify refresh token, check against stored hash
    Express->>Express: Check user.isActive && tokenVersion
    Express-->>Browser: { newAccessToken }
```

### 4.2. JWT Payload

```javascript
{
  userId: "64a1b2c...",
  tenantId: "64a1b2d...",
  roleId: "64a1b2e...",
  tokenVersion: 0,
  iat: 1234567890,
  exp: 1234568790   // 15 minutes for access token
}
```

### 4.3. Token Versioning (Req 2.5 point 4)

When an admin deactivates a user or changes their role:

```javascript
// In user.controller.js — updateUser()
user.isActive = false;  // or: user.roleId = newRoleId;
user.tokenVersion += 1;  // Invalidates ALL existing JWTs
await user.save();

// In auth middleware — every request:
if (user.tokenVersion !== decoded.tokenVersion) {
  throw new ApiError(401, 'Session invalidated. Please log in again.');
}
```

---

## 5. API Endpoints

### 5.1. Authentication

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Register new organization + super admin | Public |
| `POST` | `/api/v1/auth/login` | Login with username + password + org slug | Public |
| `POST` | `/api/v1/auth/refresh` | Refresh access token | Public (needs valid refresh token) |
| `POST` | `/api/v1/auth/logout` | Invalidate refresh token | Protected |
| `GET`  | `/api/v1/auth/me` | Get current user profile + permissions | Protected |

---

### 5.2. Users

| Method | Endpoint | Description | Permission |
|---|---|---|---|
| `GET` | `/api/v1/users` | List users (search, pagination) | `settings.manageMasters` |
| `GET` | `/api/v1/users/:id` | Get user details | `settings.manageMasters` |
| `POST` | `/api/v1/users` | Create user (with photo upload) | `settings.manageMasters` |
| `PUT` | `/api/v1/users/:id` | Update user (toggle isActive, change role) | `settings.manageMasters` |
| `DELETE` | `/api/v1/users/:id` | Soft-delete (set isActive: false) | `settings.manageMasters` |
| `GET` | `/api/v1/users/active/dropdown` | Active users for dropdowns (id, name, avatar) | Any authenticated |

---

### 5.3. Roles

| Method | Endpoint | Description | Permission |
|---|---|---|---|
| `GET` | `/api/v1/roles` | List roles with assigned user count + avatars | `settings.manageMasters` |
| `GET` | `/api/v1/roles/:id` | Get role with full permission matrix | `settings.manageMasters` |
| `POST` | `/api/v1/roles` | Create new role | `settings.manageMasters` |
| `PUT` | `/api/v1/roles/:id` | Update role permission matrix | `settings.manageMasters` |
| `DELETE` | `/api/v1/roles/:id` | Delete role (block if users assigned) | `settings.manageMasters` |

---

### 5.4. Clients

| Method | Endpoint | Description | Permission |
|---|---|---|---|
| `GET` | `/api/v1/clients` | List clients (search, filter by entityType/group/tag, pagination) | `client.view` + scope |
| `GET` | `/api/v1/clients/:id` | Get client full details + custom field values | `client.view` |
| `GET` | `/api/v1/clients/:id/summary` | Aggregated summary (task counts, ledger balance) — `$facet` | `client.view` |
| `POST` | `/api/v1/clients` | Create client with custom field values | `client.create` |
| `PUT` | `/api/v1/clients/:id` | Update client | `client.edit` |
| `DELETE` | `/api/v1/clients/:id` | Soft-delete | `client.delete` |
| `GET` | `/api/v1/clients/search` | Debounced search for global search bar + dropdowns (id, name, fileNo) | `client.view` |

---

### 5.5. Services

| Method | Endpoint | Description | Permission |
|---|---|---|---|
| `GET` | `/api/v1/services` | List services with assigned client count | `settings.manageMasters` |
| `GET` | `/api/v1/services/:id` | Get service full config (settings + checklist) | `settings.manageMasters` |
| `POST` | `/api/v1/services` | Create service | `settings.manageMasters` |
| `PUT` | `/api/v1/services/:id` | Update service (single-save for all tabs) | `settings.manageMasters` |
| `DELETE` | `/api/v1/services/:id` | Soft-delete (isEnabled: false) | `settings.manageMasters` |
| `GET` | `/api/v1/services/active/dropdown` | Active services for dropdowns | Any authenticated |

---

### 5.6. Tasks

| Method | Endpoint | Description | Permission |
|---|---|---|---|
| `GET` | `/api/v1/tasks` | List tasks (filter: status, client, service, assignee, date range, period) | `task.view` + scope |
| `GET` | `/api/v1/tasks/:id` | Get task detail (with populated refs + notes + checklist) | `task.view` |
| `POST` | `/api/v1/tasks` | Create task manually (inherits checklist from service) | `task.create` |
| `PUT` | `/api/v1/tasks/:id` | Update task (status, assignee, details) | `task.edit` |
| `PATCH` | `/api/v1/tasks/:id/status` | Quick status transition (Pending → In Progress → Completed) | `task.edit` |
| `PATCH` | `/api/v1/tasks/:id/checklist/:stepIndex` | Toggle checklist step completion | `task.edit` |
| `POST` | `/api/v1/tasks/:id/notes` | Add a note to a task | `task.edit` |
| `DELETE` | `/api/v1/tasks/:id/notes/:noteId` | Delete a note | `task.deleteNote` |
| `DELETE` | `/api/v1/tasks/:id` | Soft-delete task | `task.delete` |

**Scope enforcement in task queries:**
```javascript
// If user scope is 'assigned_only', inject filter
if (scope === 'assigned_only') {
  queryFilters.assignedUserId = req.user._id;
}
// If scope is 'team_only', get team members first
if (scope === 'team_only') {
  const teamUserIds = await getTeamMembers(req.user._id, req.tenantId);
  queryFilters.assignedUserId = { $in: teamUserIds };
}
```

---

### 5.7. Invoices

| Method | Endpoint | Description | Permission |
|---|---|---|---|
| `GET` | `/api/v1/invoices` | List invoices (filter: client, status, date range) | `invoice.view` |
| `GET` | `/api/v1/invoices/:id` | Get invoice detail with populated items | `invoice.view` |
| `POST` | `/api/v1/invoices` | Create invoice (triggers isBilled cascade) | `invoice.create` |
| `PUT` | `/api/v1/invoices/:id` | Update draft invoice only | `invoice.edit` |
| `DELETE` | `/api/v1/invoices/:id` | Cancel invoice (revert isBilled on tasks) | `invoice.delete` |
| `GET` | `/api/v1/invoices/:id/pdf` | Generate/download invoice PDF | `invoice.view` |
| `GET` | `/api/v1/billing/unbilled` | Fetch unbilled tasks (+expenses in Phase 2) for a client | `invoice.create` |

**Query params for `/billing/unbilled`**: `?clientId=xxx`

---

### 5.8. Receipts

| Method | Endpoint | Description | Permission |
|---|---|---|---|
| `GET` | `/api/v1/receipts` | List receipts | `receipt.view` |
| `GET` | `/api/v1/receipts/:id` | Get receipt detail with settlements | `receipt.view` |
| `POST` | `/api/v1/receipts` | Create receipt + settle invoices (MongoDB Transaction) | `receipt.create` |
| `GET` | `/api/v1/receipts/unpaid-invoices` | Get unpaid invoices for a client (for settlement UI) | `receipt.create` |

**Query params for `/unpaid-invoices`**: `?clientId=xxx`

---

### 5.9. Ledger

| Method | Endpoint | Description | Permission |
|---|---|---|---|
| `GET` | `/api/v1/ledger/:clientId` | Get chronological ledger (invoices as debits, receipts as credits, running balance) | `client.viewLedger` |

---

### 5.10. Dashboard

| Method | Endpoint | Description | Permission |
|---|---|---|---|
| `GET` | `/api/v1/dashboard/overview` | Aggregated dashboard data (basic widgets only in Phase 1) | Any authenticated |

**Phase 1 response** (simplified — full widgets in Phase 2):
```json
{
  "success": true,
  "data": {
    "quickStats": {
      "totalClients": 43,
      "pendingTasks": 27,
      "overdueInvoices": 5,
      "totalReceivables": 125000
    },
    "upcomingHolidays": [],
    "recentActivity": []
  }
}
```

---

### 5.11. Master Settings

| Method | Endpoint | Description | Permission |
|---|---|---|---|
| `GET` | `/api/v1/masters/bootstrap` | **Single endpoint**: returns all master lists + tenant settings in one payload | Any authenticated |
| **Tags** | | | |
| `GET` | `/api/v1/masters/tags` | List tags | `settings.manageMasters` |
| `POST` | `/api/v1/masters/tags` | Create tag | `settings.manageMasters` |
| `PUT` | `/api/v1/masters/tags/:id` | Update tag | `settings.manageMasters` |
| `DELETE` | `/api/v1/masters/tags/:id` | Delete tag | `settings.manageMasters` |
| **Client Groups** | | | |
| `GET` | `/api/v1/masters/client-groups` | List | `settings.manageMasters` |
| `POST` | `/api/v1/masters/client-groups` | Create | `settings.manageMasters` |
| `PUT` | `/api/v1/masters/client-groups/:id` | Update | `settings.manageMasters` |
| `DELETE` | `/api/v1/masters/client-groups/:id` | Delete | `settings.manageMasters` |
| **Payment Modes** | | | |
| `GET/POST/PUT/DELETE` | `/api/v1/masters/payment-modes[/:id]` | CRUD | `settings.manageMasters` |
| **Expense Categories** | | | |
| `GET/POST/PUT/DELETE` | `/api/v1/masters/expense-categories[/:id]` | CRUD | `settings.manageMasters` |
| **Holidays** | | | |
| `GET/POST/PUT/DELETE` | `/api/v1/masters/holidays[/:id]` | CRUD | `settings.manageMasters` |
| **Document Types** | | | |
| `GET/POST/PUT/DELETE` | `/api/v1/masters/document-types[/:id]` | CRUD | `settings.manageMasters` |
| **Billing Entity** | | | |
| `GET` | `/api/v1/masters/billing-entity` | Get primary billing entity | `settings.manageMasters` |
| `PUT` | `/api/v1/masters/billing-entity/:id` | Update billing entity (logo, signature, prefix) | `settings.manageMasters` |
| **Tenant Settings** | | | |
| `GET` | `/api/v1/masters/settings` | Get tenant settings (includes client custom field defs) | `settings.manageMasters` |
| `PUT` | `/api/v1/masters/settings` | Update tenant settings | `settings.manageMasters` |
| `POST` | `/api/v1/masters/settings/client-custom-fields` | Add a custom field definition | `settings.manageMasters` |
| `PUT` | `/api/v1/masters/settings/client-custom-fields/:index` | Update a custom field definition | `settings.manageMasters` |
| `DELETE` | `/api/v1/masters/settings/client-custom-fields/:index` | Remove a custom field definition | `settings.manageMasters` |

**Bootstrap response** (cached by React on login):
```json
{
  "success": true,
  "data": {
    "tags": [{ "_id": "...", "name": "VIP", "color": "#EF4444" }],
    "clientGroups": [{ "_id": "...", "name": "Sharma Family" }],
    "paymentModes": [{ "_id": "...", "name": "HDFC Bank" }],
    "expenseCategories": [{ "_id": "...", "name": "Legal" }],
    "documentTypes": [{ "_id": "...", "name": "Passbook" }],
    "holidays": [{ "date": "2026-08-15", "eventName": "Independence Day" }],
    "billingEntity": { "_id": "...", "name": "Mative & Co", "invoicePrefix": "INV-" },
    "users": [{ "_id": "...", "name": "Kunal", "photoUrl": "..." }],
    "services": [{ "_id": "...", "name": "GST-3B (M)" }],
    "tenantSettings": {
      "clientCustomFields": [...],
      "allowDuplicateClientNames": false,
      "defaultGstPercentage": 18
    }
  }
}
```

---

## 6. Core Business Logic

### 6.1. Invoice Creation Flow (Req 7.1)

```mermaid
sequenceDiagram
    participant React
    participant Express
    participant MongoDB

    React->>Express: GET /api/v1/billing/unbilled?clientId=123
    Express->>MongoDB: Task.find({ tenantId, clientId: 123,<br/>status: 'Completed', isBilled: false })
    MongoDB-->>Express: [Task1, Task2, Task3]
    Express-->>React: { unbilledTasks: [...], unbilledExpenses: [] }

    Note over React: User selects tasks, adds manual items,<br/>adjusts amounts, reviews totals

    React->>Express: POST /api/v1/invoices<br/>{ clientId, items: [...], totals: {...} }
    Express->>MongoDB: Generate next invoiceNo (BillingEntity.invoiceNextNumber++)
    Express->>MongoDB: Invoice.create({...})
    Note over Express: post('save') hook fires:
    Express->>MongoDB: Task.updateMany({ _id: { $in: taskIds } },<br/>{ isBilled: true, invoiceId: newInvoice._id })
    Express-->>React: { success: true, data: invoice }
```

### 6.2. Receipt Settlement Flow (Req 7.2 — MongoDB Transaction)

> [!CAUTION]
> This is the highest-risk operation in Phase 1. A partially-applied receipt corrupts the ledger. MongoDB Transactions are **mandatory**.

```javascript
// services/receipt.service.js
async function createReceiptWithSettlement(receiptData, settlements, tenantId) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // 1. Generate receipt number
    const billingEntity = await BillingEntity.findOneAndUpdate(
      { tenantId, isPrimary: true },
      { $inc: { receiptNextNumber: 1 } },
      { session, new: true }
    );
    const receiptNo = `${billingEntity.receiptPrefix}${billingEntity.receiptNextNumber - 1}`;
    
    // 2. Create receipt document
    const receipt = await Receipt.create([{
      tenantId,
      ...receiptData,
      receiptNo,
      settlements
    }], { session });
    
    // 3. Update each invoice's amountPaid and status
    for (const settlement of settlements) {
      const invoice = await Invoice.findById(settlement.invoiceId).session(session);
      if (!invoice) throw new ApiError(404, `Invoice ${settlement.invoiceId} not found`);
      
      invoice.totals.amountPaid += settlement.settledAmount;
      invoice.totals.amountDue = invoice.totals.grandTotal - invoice.totals.amountPaid;
      
      // Update status
      if (invoice.totals.amountDue <= 0) {
        invoice.status = 'Paid';
      } else if (invoice.totals.amountPaid > 0) {
        invoice.status = 'Partially Paid';
      }
      
      await invoice.save({ session });
    }
    
    // 4. Commit
    await session.commitTransaction();
    return receipt[0];
    
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
```

### 6.3. Ledger Calculation (Req 6.8)

The ledger merges invoices (debits) and receipts (credits) into a single chronological stream with a running balance:

```javascript
// services/ledger.service.js
async function getClientLedger(tenantId, clientId, dateRange) {
  // 1. Fetch invoices (debits)
  const invoices = await Invoice.find({
    tenantId, clientId,
    status: { $ne: 'Cancelled' },
    date: { $gte: dateRange.from, $lte: dateRange.to }
  }).select('invoiceNo date totals.grandTotal status items').lean();
  
  // 2. Fetch receipts (credits)
  const receipts = await Receipt.find({
    tenantId, clientId,
    date: { $gte: dateRange.from, $lte: dateRange.to }
  }).select('receiptNo date totalAmount paymentMode').lean();
  
  // 3. Merge into unified ledger entries
  const entries = [
    ...invoices.map(inv => ({
      date: inv.date,
      type: 'Invoice',
      referenceNo: inv.invoiceNo,
      referenceId: inv._id,
      debit: inv.totals.grandTotal,
      credit: 0,
      status: inv.status,
      items: inv.items  // For "Show Invoice Items" toggle
    })),
    ...receipts.map(rct => ({
      date: rct.date,
      type: 'Receipt',
      referenceNo: rct.receiptNo,
      referenceId: rct._id,
      debit: 0,
      credit: rct.totalAmount,
      paymentMode: rct.paymentMode
    }))
  ];
  
  // 4. Sort chronologically
  entries.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // 5. Calculate running balance (SERVER-SIDE — Req 6.8)
  let runningBalance = 0;
  for (const entry of entries) {
    runningBalance += entry.debit - entry.credit;
    entry.balance = runningBalance;
  }
  
  return { entries, closingBalance: runningBalance };
}
```

### 6.4. Sequence Number Generation

```javascript
// services/sequence.service.js
async function getNextInvoiceNumber(tenantId, session) {
  const entity = await BillingEntity.findOneAndUpdate(
    { tenantId, isPrimary: true },
    { $inc: { invoiceNextNumber: 1 } },
    { session, new: true, select: 'invoicePrefix invoiceNextNumber' }
  );
  
  const paddedNum = String(entity.invoiceNextNumber - 1).padStart(4, '0');
  return `${entity.invoicePrefix}${paddedNum}`;
  // Output: "INV-0001", "INV-0002", etc.
}
```

---

## 7. Middleware Architecture

### Request Processing Pipeline

```
Incoming Request
  │
  ▼
┌─────────────────┐
│  Rate Limiter    │  Per-tenant, per-IP rate limiting
└────────┬────────┘
         │
  ▼
┌─────────────────┐
│  Body Parser     │  express.json({ limit: '10mb' })
└────────┬────────┘
         │
  ▼
┌─────────────────┐
│  CORS            │  Whitelist frontend origins
└────────┬────────┘
         │
  ▼
┌─────────────────┐
│  Auth Middleware  │  Verify JWT → hydrate req.user (populate role)
│  (auth.js)       │  Check isActive, tokenVersion
└────────┬────────┘
         │
  ▼
┌─────────────────┐
│  Tenant Scope    │  Extract tenantId from JWT → inject req.tenantId
│  (tenantScope.js)│  Safety: reject if missing
└────────┬────────┘
         │
  ▼
┌─────────────────┐
│  Authorize       │  Check permission matrix: authorize('task', 'view')
│  (authorize.js)  │  Apply scope filters: inject query constraints
└────────┬────────┘
         │
  ▼
┌─────────────────┐
│  Validate        │  Run Joi schema on req.body / req.query / req.params
│  (validate.js)   │  Return 400 with field-level errors
└────────┬────────┘
         │
  ▼
┌─────────────────┐
│  Controller      │  Business logic (delegates to services/)
└────────┬────────┘
         │
  ▼
┌─────────────────┐
│  Error Handler   │  Global catch-all: formats ApiError → JSON response
│  (errorHandler)  │  Logs to console/file in dev, structured JSON in prod
└─────────────────┘
```

### 7.1. Authorize Middleware (RBAC + SBAC)

```javascript
// middleware/authorize.js
const authorize = (module, action) => {
  return async (req, res, next) => {
    const role = req.user.role;  // Already populated in auth middleware
    
    // Super Admin bypass (Req 2.5 point 2)
    if (role.isSuperAdmin) return next();
    
    // Check permission
    const permission = role.permissions?.[module]?.[action];
    
    if (!permission || !permission.allowed) {
      throw new ApiError(403, `You don't have permission to ${action} ${module}`);
    }
    
    // SBAC: Inject scope-based query filters into req (Req 2.4)
    req.permissionScope = permission.scope || 'everything';
    
    if (req.permissionScope === 'assigned_only') {
      req.scopeFilter = { assignedUserId: req.user._id };
    } else if (req.permissionScope === 'team_only') {
      // Future: define team relationships
      req.scopeFilter = { assignedUserId: req.user._id };
    } else {
      req.scopeFilter = {};  // 'everything' — no restriction
    }
    
    next();
  };
};

// Usage in routes:
router.get('/tasks', auth, tenantScope, authorize('task', 'view'), taskController.list);
```

### 7.2. Standardized Responses

```javascript
// utils/ApiResponse.js
class ApiResponse {
  static success(res, data, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data
    });
  }

  static paginated(res, data, pagination) {
    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: Math.ceil(pagination.total / pagination.limit)
      }
    });
  }
}

// utils/ApiError.js
class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;  // Field-level validation errors
    this.isOperational = true;
  }
}

// middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    const errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
    return res.status(statusCode).json({ success: false, message, errors });
  }
  
  // Mongoose duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `${field} already exists`;
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }
  
  res.status(statusCode).json({
    success: false,
    message,
    errors: err.errors || [],
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
```

---

## 8. Frontend Architecture Overview

### 8.1. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | React 18+ (Vite) | Fast HMR, modern tooling |
| Routing | React Router v6 | Nested routes, layout outlets |
| State (Global) | React Context + `useReducer` | Auth, Permissions, Masters — no Redux needed for Phase 1 |
| Forms | React Hook Form + Joi | Performant forms, shared validators with backend |
| Data Fetching | Axios + custom hooks | `useQuery`-like pattern without React Query dependency |
| UI Components | Custom design system | Full control, no Tailwind (per guidelines) |
| Charts | Recharts (Phase 2) | Lightweight for dashboard widgets |
| Dropdowns | react-select | Async search, virtualization-ready |
| Date Handling | dayjs | Lightweight, immutable, timezone support |
| PDF Viewer | react-pdf (optional) | Inline invoice preview |

### 8.2. Route Structure

```
/login
/register
/
├── /dashboard
├── /clients
│   ├── /clients/new
│   ├── /clients/:id           → Client Dashboard (tabs below)
│   │   ├── /details           → Details tab (default)
│   │   ├── /services          → Phase 2
│   │   ├── /tasks             → Tasks scoped to client
│   │   └── /ledger            → Ledger tab
├── /tasks
│   ├── /tasks/new
│   └── /tasks/:id
├── /services
│   ├── /services/new
│   └── /services/:id          → Multi-tab config
├── /invoices
│   ├── /invoices/new
│   └── /invoices/:id
├── /receipts
│   ├── /receipts/new
│   └── /receipts/:id
├── /users
│   ├── /users/new
│   └── /users/:id
├── /roles
│   ├── /roles/new
│   └── /roles/:id             → Permission matrix editor
└── /settings
    ├── /settings/billing
    ├── /settings/tags
    ├── /settings/groups
    ├── /settings/payment-modes
    ├── /settings/expense-categories
    ├── /settings/holidays
    ├── /settings/document-types
    └── /settings/client-fields   → Custom field definitions
```

### 8.3. Key React Patterns

**Permission Gating:**
```jsx
// components/shared/PermissionGate.jsx
function PermissionGate({ module, action, children, fallback = null }) {
  const { hasPermission } = usePermissions();
  return hasPermission(module, action) ? children : fallback;
}

// Usage:
<PermissionGate module="invoice" action="create">
  <button>+ New Invoice</button>
</PermissionGate>
```

**Masters Context (bootstrapped on login):**
```jsx
// On login success:
const bootstrapData = await api.get('/masters/bootstrap');
setMasters(bootstrapData);
// All dropdowns read from this context — zero additional API calls
```

---

## 9. Verification & Testing

### 9.1. End-to-End Smoke Test (Phase 1 Gate)

The following flow must work without errors before Phase 1 ships:

```
1. Register a new organization "Test Agency"
   → Org, Super Admin user, Super Admin role, BillingEntity, TenantSettings created

2. Login as Super Admin
   → JWT issued, bootstrap data cached

3. Create a custom role "Accountant" with limited permissions
   → Permission matrix saved correctly

4. Create a user "Kunal" with role "Accountant"
   → Photo uploaded, password hashed

5. Define 2 client custom fields: "TAN" (text) and "Business Type" (select)
   → Saved in TenantSettings.clientCustomFields

6. Create a client "Auto Prime" with custom field values
   → Custom fields rendered dynamically, values saved

7. Create a service "GST-3B (Monthly)" with a 3-step checklist
   → Service saved with checklist array

8. Create 3 tasks for "Auto Prime" under "GST-3B" service
   → Checklist inherited from service

9. Complete 2 tasks (check all checklist steps first)
   → Status → Completed, completedAt set

10. Create an invoice for "Auto Prime"
    → Fetch unbilled shows 2 tasks
    → Generate invoice → isBilled set to true on both tasks

11. Verify: Fetch unbilled again → returns 0 tasks

12. Record a partial receipt for the invoice
    → Invoice status → "Partially Paid", amountDue reduced

13. Record another receipt to fully settle
    → Invoice status → "Paid", amountDue = 0

14. View client ledger
    → 2 debits (invoice) + 2 credits (receipts) with correct running balance

15. Login as "Kunal" (Accountant) → verify permission restrictions apply
    → Cannot see settings, scope filters work on tasks
```

### 9.2. Automated Tests

```bash
# Unit Tests (Mongoose models, utility functions, validators)
npm run test:unit

# Integration Tests (API endpoints with supertest + mongodb-memory-server)
npm run test:integration

# Key test files:
tests/integration/auth.test.js        # Registration, login, refresh, token versioning
tests/integration/rbac.test.js         # Permission matrix enforcement, scope filtering
tests/integration/tenant.test.js       # Cross-tenant data isolation
tests/integration/invoice.test.js      # Unbilled fetch, isBilled cascade
tests/integration/receipt.test.js      # Settlement with transactions, partial payments
tests/integration/ledger.test.js       # Running balance calculation
```

### 9.3. Security Tests

- [ ] Tenant A cannot access Tenant B's data
- [ ] Deactivated user's JWT is immediately rejected
- [ ] Super Admin role cannot be deleted or modified
- [ ] Password hashes are never returned in API responses
- [ ] Rate limiting prevents brute-force login attempts

---

## 10. Phase 1 Task Breakdown

### Sprint 1 (Weeks 1–2): Foundation

- [ ] Initialize monorepo structure (server + client)
- [ ] Set up Express app (middleware stack, error handling, env config)
- [ ] Connect MongoDB with connection retry logic
- [ ] Implement Organization + User + Role schemas
- [ ] Build auth flow: register, login, refresh, logout, /me
- [ ] Implement `auth`, `tenantScope`, `authorize` middleware chain
- [ ] Build Role CRUD + permission matrix editor API
- [ ] Set up S3-compatible file upload (Cloudinary or S3)
- [ ] Write tenant isolation integration tests

### Sprint 2 (Weeks 3–4): Client & Service Foundation

- [ ] Implement all Master schemas (Tags, ClientGroups, etc.)
- [ ] Build master CRUD endpoints + bootstrap endpoint
- [ ] Implement TenantSettings schema with client custom field definitions
- [ ] Build Client schema + CRUD endpoints
- [ ] Dynamic custom fields: definition API + value storage on clients
- [ ] Build Service schema + CRUD endpoints (Settings + Checklist tabs)
- [ ] Client search endpoint (debounced, paginated)
- [ ] Write integration tests for client + service CRUD

### Sprint 3 (Weeks 5–6): Task Management

- [ ] Implement Task schema + CRUD endpoints
- [ ] Task creation: inherit checklist from linked service
- [ ] Checklist step toggle endpoint
- [ ] Notes CRUD on tasks
- [ ] Status transition logic (enforce checklist completion if service requires it)
- [ ] SBAC scope enforcement on task list queries
- [ ] Task filtering (status, client, service, assignee, date range)
- [ ] Write integration tests for task flows

### Sprint 4 (Weeks 7–8): Billing & Ledger

- [ ] Implement BillingEntity schema + CRUD
- [ ] Sequence number generation service
- [ ] Implement Invoice schema + CRUD
- [ ] Build "fetch unbilled tasks" endpoint
- [ ] Implement `isBilled` cascade on invoice save
- [ ] Invoice cancellation: revert `isBilled` on tasks
- [ ] Invoice PDF generation (HTML template → PDF)
- [ ] Implement Receipt schema
- [ ] Receipt creation with MongoDB transaction (settlement logic)
- [ ] Auto-apply settlement algorithm
- [ ] Ledger service: merge invoices + receipts with running balance
- [ ] Write integration tests (critical: transaction rollback on failure)

### Sprint 5 (Weeks 9–10): Frontend + Integration + Polish

- [ ] React: Auth pages (login, register)
- [ ] React: Layout shell (TopBar, Sidebar, MainLayout with Outlet)
- [ ] React: AuthContext, PermissionsContext, MastersContext
- [ ] React: `<DataTable />` reusable component
- [ ] React: User management pages
- [ ] React: Role permission matrix editor
- [ ] React: Client list + create/edit form (with dynamic custom fields)
- [ ] React: Service list + settings/checklist editor
- [ ] React: Task list + create form + detail view
- [ ] React: Invoice creation flow (fetch unbilled → build → save)
- [ ] React: Receipt creation flow (show unpaid invoices → settle)
- [ ] React: Client dashboard (Details tab + Ledger tab)
- [ ] React: Settings pages (masters CRUD, billing entity, custom fields)
- [ ] React: Dashboard landing page (basic quick stats)
- [ ] End-to-end smoke test (Section 9.1)
- [ ] Bug fixes, UI polish, responsive layout

---

## Environment Variables

```bash
# .env.example
NODE_ENV=development
PORT=5000

# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/proactive?retryWrites=true&w=majority

# JWT
JWT_ACCESS_SECRET=your-256-bit-secret
JWT_REFRESH_SECRET=your-256-bit-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# S3-Compatible Storage (Cloudinary or AWS S3)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Or AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
AWS_REGION=

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Frontend URL (CORS)
CLIENT_URL=http://localhost:5173
```

---

## Open Questions

> [!IMPORTANT]
> **Invoice PDF Template**: Should the invoice PDF follow a specific GST-compliant format (e.g., HSN/SAC breakdown with CGST/SGST split), or is a simple professional template sufficient for Phase 1?

> [!IMPORTANT]
> **Org Slug Strategy**: For login, should users type their organization slug (e.g., `mative-co.proactive.app`) as a subdomain, or select from a dropdown / type it as a form field? This affects DNS setup and auth flow.
