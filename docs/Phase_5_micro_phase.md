# Proactive SaaS — Phase 5: Client Portal, Global Time Tracking, UPI Payments & Enterprise Scale
## Backend Micro-Phase Architecture Plan (Phases 121–145)

> **Context:** Phase 5 Scope — Client Self-Service Portal & White-Label CMS, Scoped Client RBAC, Real-time Global Time Tracking & Timesheets, Dynamic UPI QR Code & Payment Gateway Webhook Reconciliation, Enterprise Multi-Branch Operations (Multi-Billing Entities), and SaaS Plan & Quota Enforcement.  
> **Complements:** [`Backend/docs/Phase_5_micro_phase_frontend.md`](file:///c:/Users/hp/Desktop/Proactive/Backend/docs/Phase_5_micro_phase_frontend.md) (Phases F-121 to F-145).  
> **Source Documents:** [`Requirement.md`](file:///c:/Users/hp/Desktop/Proactive/Backend/docs/Requirement.md) (Modules 1.1, 1.3.5, 6, 7, 10, 12, 13), [`MVPs.md`](file:///c:/Users/hp/Desktop/Proactive/Backend/docs/MVPs.md) (Sections 3.6, 3.7, 5, 6), [`readme.md`](file:///c:/Users/hp/Desktop/Proactive/readme.md).  
> **Stack:** Node.js · Express.js · TypeScript · MongoDB (Mongoose Multi-Doc Transactions) · BullMQ · Redis · Multer · JWT (Client-Scoped) · Razorpay / Cashfree SDK · QRCode (`qrcode`) · Crypto (HMAC-SHA256).  
> **Target Status:** 0% Initialized → Production Ready Architecture Blueprint with Integration Testing Specifications.

---

## 1. Architectural Overview

Phase 5 represents the final evolutionary tier of the Proactive Practice Management OS, transforming it from an internal firm management tool into an end-to-end client engagement and enterprise multi-branch ecosystem:

1. **Client Portal & White-Label CMS:** External self-service portal allowing clients to securely log in via OTP/Password, access their compliance calendar, download filed GST/IT returns, view unpaid invoices, upload requested documents, and raise service queries under the agency's white-labeled domain and branding.
2. **Client Self-Service Compliance & Billing Hub:** Direct client-facing REST APIs delivering scoped, read-only/actionable views of compliance timelines, document repositories, ledger running balances, and direct document request fulfillment.
3. **Payment Gateway, Dynamic UPI & Instant Reconciliation:** Automated collection engine generating NPCI-compliant UPI QR codes (`upi://pay`) and Razorpay payment links directly on invoices, verified cryptographically via webhooks to instantly settle invoices and generate receipts under ACID transactions.
4. **Global Time Tracking & Timesheets:** Real-time, server-synchronized stopwatch and time-logging engine tracking billable and non-billable hours against tasks, weekly timesheet review/approval workflows, and staff efficiency/realization analytics.
5. **Enterprise Multi-Branch & SaaS Licensing:** Multi-billing entity architecture supporting firms with multiple regional branches or distinct LLP/Proprietorship entities with isolated sequence numbering (`INV-MUM-`, `INV-BLR-`), alongside SaaS tier enforcement (Starter, Professional, Enterprise) and tenant resource quota limits.

```mermaid
graph TD
    subgraph Part 25: Client Portal & White-Label CMS
        AgencyConfig["Agency CMS (Subdomain, Logo, Theme)"] --> PortalLanding["White-Label Portal Landing"]
        ClientUser["Client Contact (allowLogin: true)"] -->|OTP / Password Login| ClientAuth["Client Auth Engine (JWT: role='Client')"]
        ClientAuth --> ClientPortal["Client Self-Service Workspace"]
    end

    subgraph Part 26: Compliance, Documents & Billing Hub
        ClientPortal --> CompCal["Compliance Calendar (Tasks & Milestones)"]
        ClientPortal --> DocVault["Filed Returns Vault (One-Click Download)"]
        ClientPortal --> BillingLedger["Invoices, Receipts & Ledger Balance"]
        ClientPortal --> DocUpload["Fulfill Document Requests (Direct Upload)"]
    end

    subgraph Part 27: Dynamic UPI & Payment Reconciliation
        Invoice["Invoice (amountDue > 0)"] --> UPIQR["Dynamic UPI QR Generator (NPCI / Razorpay)"]
        ClientPay["Client Pays via UPI / Card"] --> GatewayHook["Payment Gateway Webhook (HMAC-SHA256)"]
        GatewayHook --> AutoReconcile["ACID Transaction Settlement Engine"]
        AutoReconcile --> MarkedPaid["Invoice: amountDue=0, status='Paid'"]
        AutoReconcile --> NewReceipt["Auto-Generated Receipt (RCT-XXXX)"]
    end

    subgraph Part 28: Global Time Tracking & Timesheets
        StaffTimer["TopBar Stopwatch (Start / Stop)"] --> SyncAPI["Server Time Sync Engine"]
        SyncAPI --> TaskTimeLogs["Task timeLogs Collection (Billable/Non-Billable)"]
        TaskTimeLogs --> WeeklyTimesheet["Weekly Timesheet Matrix (Approval Workflow)"]
        WeeklyTimesheet --> StaffAnalytics["Staff Efficiency & Realization Analytics"]
    end

    subgraph Part 29: Multi-Branch & SaaS Licensing
        Tenant["CA / Accounting Tenant"] --> BranchA["Branch / Entity 1 (Mumbai - Auditing)"]
        Tenant --> BranchB["Branch / Entity 2 (Delhi - Consulting)"]
        BranchA --> SeqA["Isolated Sequence: INV-MUM-2026-XXXX"]
        BranchB --> SeqB["Isolated Sequence: INV-DEL-2026-XXXX"]
        Tenant --> QuotaEngine["SaaS Quota & Plan Enforcement (Starter/Pro/Enterprise)"]
    end
```

---

## 2. Phase Breakdown & Feature Matrix (Phases 121–145)

| Part | Phase | Title | Primary Endpoints | Core Responsibility |
|---|---|---|---|---|
| **Part 25** | **121** | Client User Model & `allowLogin` Activation | N/A (Mongoose Models) | Schema for client portal logins (`ClientUser`), bcrypt credential storage, and tenant isolation. |
| | **122** | Client Portal Authentication Engine | `POST /api/v1/portal/auth/login`<br>`POST /api/v1/portal/auth/verify-otp`<br>`POST /api/v1/portal/auth/send-magic-link` | Password & phone/email OTP authentication issuing scoped JWT tokens (`role: 'Client'`). |
| | **123** | White-Label Website CMS & Domain Settings Schema | N/A (Mongoose Model & DNS Config) | `TenantWebsiteSettings` model for subdomain, custom DNS, agency branding, hero banners, and service showcase. |
| | **124** | Public & Portal Configuration APIs | `GET /api/v1/portal/website-config`<br>`GET /api/v1/portal/profile`<br>`PUT /api/v1/tenant-settings/website` | Public endpoint resolving firm metadata by hostname/subdomain, and agency CMS configuration endpoints. |
| | **125** | Client Security Middleware & Isolation Layer | Pure Middleware Module | Strict RBAC middleware preventing client tokens from accessing internal staff routes or other tenants. |
| **Part 26** | **126** | Client Compliance Calendar & Milestone API | `GET /api/v1/portal/compliance-calendar` | Client-scoped statutory deadlines, upcoming filings (GST, TDS, IT), and completed task milestones. |
| | **127** | Client Documents Repository & Return Vault | `GET /api/v1/portal/documents`<br>`GET /api/v1/portal/documents/:id/download` | Categorized repository of filed returns, audited statements, and acknowledgments with secure download links. |
| | **128** | Client Invoices, Receipts & Ledger Statement | `GET /api/v1/portal/invoices`<br>`GET /api/v1/portal/receipts`<br>`GET /api/v1/portal/ledger` | Real-time billing overview: unpaid invoices, receipt history, and downloadable running balance statement. |
| | **129** | Direct Document Request Fulfillment Service | `POST /api/v1/portal/documents/upload`<br>`POST /api/v1/portal/requests/:id/fulfill` | Upload handler allowing clients to fulfill pending CA document requests with automatic status updates. |
| | **130** | Client Service Requests & Support Query API | `POST /api/v1/portal/queries`<br>`GET /api/v1/portal/queries` | Allows clients to submit new service requests or support tickets; auto-assigns internal task to staff. |
| **Part 27** | **131** | Payment Gateway Configuration Schema & Keys | N/A (Mongoose Model & Crypto) | Encrypted storage of Razorpay/Cashfree API keys, Webhook secrets, and UPI VPAs per billing entity. |
| | **132** | Dynamic UPI QR Code & Payment Link Generator | `POST /api/v1/invoices/:id/payment-link`<br>`GET /api/v1/invoices/:id/upi-qr` | Generates standard NPCI UPI payload (`upi://pay`) with base64 QR code and online payment links. |
| | **133** | Gateway Webhook Receiver & Cryptographic Verification | `POST /api/v1/payments/webhook` | Raw-body webhook receiver verifying HMAC-SHA256 signature to guarantee payment authenticity. |
| | **134** | ACID Auto-Reconciliation & Instant Receipt Generator | Service Transaction Hook | Multi-document transaction on payment success: updates invoice balances and creates `Receipt`. |
| | **135** | Payment Transactions Ledger & Audit History | `GET /api/v1/payments/transactions`<br>`GET /api/v1/payments/transactions/:id` | Tenant-wide payment log tracking gateway transactions, UTR numbers, payment modes, and failure diagnostics. |
| **Part 28** | **136** | Time Tracking Model & Task Log Schema | N/A (Mongoose Model) | `TimeLog` schema and Task integration tracking duration, billable flag, hourly rates, and staff notes. |
| | **137** | Global Stopwatch API (Start, Pause, Resume, Stop) | `POST /api/v1/timetracking/start`<br>`POST /api/v1/timetracking/stop`<br>`GET /api/v1/timetracking/active` | Server-synchronized stopwatch API preventing client-side timer drift across page reloads. |
| | **138** | Manual Time Entry & Task Association CRUD | `POST /api/v1/tasks/:taskId/timelogs`<br>`PUT /api/v1/tasks/:taskId/timelogs/:logId`<br>`DELETE /api/v1/tasks/:taskId/timelogs/:logId` | Granular time recording with manual duration entry, date selection, billable toggle, and notes. |
| | **139** | Timesheet Aggregation, Review & Approval Workflow | `GET /api/v1/timetracking/timesheets`<br>`PATCH /api/v1/timetracking/timesheets/:id/approve` | Weekly/monthly timesheet grid grouping logs by staff/date with manager review and approval states. |
| | **140** | Staff Utilization & Billable Hours Analytics | `GET /api/v1/analytics/time-utilization` | Aggregation computing staff realization rate, billable vs non-billable ratio, and unbilled hours value. |
| **Part 29** | **141** | Multi-Branch & Billing Entity Master Schema | N/A (Mongoose Model) | Multi-entity model supporting separate branches (GSTIN, PAN, bank accounts, logo, state code). |
| | **142** | Branch-Isolated Sequence Generator Service | `sequence.service.ts` Upgrade | Atomic sequence generator partitioned by `{ tenantId, billingEntityId }` e.g., `INV-MUM-2026-001`. |
| | **143** | Cross-Branch Invoicing & Financial Filtering | `POST /api/v1/invoices` (Multi-Entity)<br>`GET /api/v1/reports/branch-sales` | Invoicing workspace routing to selected billing entity; branch-level sales and GST reporting. |
| | **144** | SaaS Subscription, Plan Enforcement & Feature Gating | Pure Middleware & Service | `TenantPlan` schema: Starter, Professional, Enterprise; middleware enforcing user and client quotas. |
| | **145** | Tenant Usage Metrics & Automated Renewal Worker | `GET /api/v1/tenant/usage`<br>BullMQ Daily Worker | Computes active user seats, storage consumption, client count; automated worker triggers renewal alerts. |

---

## 3. Detailed Phase Specifications

---

### Part 25: Client Portal Authentication, Scoped RBAC & White-Label CMS (Phases 121–125)

#### Phase 121: Client User Model & `allowLogin` Activation
- **Goal:** Enable designated client representatives or business owners to authenticate securely into the client portal.
- **Models:**
  - `Backend/src/models/ClientUser.ts`:
  ```typescript
  export interface IClientUser extends Document {
    tenantId: mongoose.Types.ObjectId;
    clientId: mongoose.Types.ObjectId; // Link to parent Client record
    name: string;
    email: string;
    phone: string;
    passwordHash?: string; // Optional if using purely OTP / Magic Link
    isPrimaryContact: boolean;
    isActive: boolean;
    lastLoginAt?: Date;
    otpSecret?: {
      code: string;
      expiresAt: Date;
    };
    magicLinkToken?: string;
    magicLinkExpiresAt?: Date;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
  }
  ```
- **Client Model Update:** Ensure `allowLogin: { type: Boolean, default: false }` and `portalUsers: [{ type: ObjectId, ref: 'ClientUser' }]` in `Client.ts`.
- **Indexes:**
  - `{ tenantId: 1, email: 1 }` (unique within tenant)
  - `{ tenantId: 1, phone: 1 }`
  - `{ tenantId: 1, clientId: 1 }`
- **Plugin:** Attach `tenantPlugin`.

#### Phase 122: Client Portal Authentication Engine
- **Goal:** Provide modern, friction-free login methods (Password, OTP via SMS/WhatsApp, or Magic Link).
- **Endpoints:**
  - `POST /api/v1/portal/auth/login`:
    - Validates client credentials against `ClientUser`.
    - Verifies parent `Client.allowLogin === true` and `ClientUser.isActive === true`.
    - Returns scoped JWT: `{ userId, clientId, tenantId, role: 'Client', isClient: true }` with 24h validity.
  - `POST /api/v1/portal/auth/request-otp`:
    - Accepts `{ emailOrPhone }`.
    - Generates 6-digit secure crypto OTP valid for 10 minutes.
    - Dispatches via BullMQ notification worker (WhatsApp / SMS / Email).
  - `POST /api/v1/portal/auth/verify-otp`:
    - Validates OTP code, clears OTP on match, updates `lastLoginAt`, and returns scoped JWT.
  - `POST /api/v1/portal/auth/send-magic-link`:
    - Generates one-time crypto hex token, stores expiration (15 mins), and dispatches magic link URL.

#### Phase 123: White-Label Website CMS & Domain Settings Schema
- **Goal:** Store configuration allowing each CA practice to brand their client portal with their own agency identity.
- **Model:** `Backend/src/models/TenantWebsiteSettings.ts`:
  ```typescript
  export interface ITenantWebsiteSettings extends Document {
    tenantId: mongoose.Types.ObjectId;
    subdomain: string; // e.g., "sharma-ca" -> sharma-ca.proactive.in
    customDomain?: string; // e.g., "portal.sharmaca.com"
    customDomainVerified: boolean;
    firmDisplayName: string;
    logoUrl?: string;
    faviconUrl?: string;
    primaryBrandColor: string; // Default: "#1e3a8a"
    heroBannerTitle: string;
    heroBannerSubtitle?: string;
    heroBannerImageUrl?: string;
    aboutUsText?: string;
    servicesOffered: {
      title: string;
      description: string;
      iconName?: string;
      isEnabled: boolean;
    }[];
    contactEmail: string;
    contactPhone: string;
    officeAddress: string;
    googleMapsEmbedUrl?: string;
    socialLinks?: {
      linkedin?: string;
      twitter?: string;
      website?: string;
    };
    updatedAt: Date;
  }
  ```
- **Indexes:**
  - `{ subdomain: 1 }` (unique)
  - `{ customDomain: 1 }` (sparse unique)

#### Phase 124: Public & Portal Configuration APIs
- **Goal:** Public endpoints resolving white-label metadata based on incoming request hostname, and internal management routes.
- **Endpoints:**
  - `GET /api/v1/portal/website-config`:
    - Resolves tenant via `Host` header (`req.headers.host`) or `?subdomain=` parameter.
    - Returns public branding metadata (firm name, logo, primary color, hero banner, services list, contact info).
  - `GET /api/v1/portal/profile`:
    - Protected by `clientAuthMiddleware`.
    - Returns authenticated client representative details, parent entity legal name, PAN, and GSTIN.
  - `PUT /api/v1/tenant-settings/website`:
    - Staff endpoint (`settings.manage` permission).
    - Updates agency CMS config, logo upload, and subdomain/domain settings.

#### Phase 125: Client Security Middleware & Isolation Layer
- **Goal:** Guarantee multi-tenant and internal system integrity by enforcing impenetrable role boundaries.
- **Middleware:** `Backend/src/middlewares/client-auth.ts`:
  - Validates JWT payload.
  - Strictly asserts `req.user.role === 'Client'` and `req.user.isClient === true`.
  - Injects `req.clientId` and `req.tenantId` into Express context.
  - **Internal Route Shield:** Internal staff endpoints (`/api/v1/tasks`, `/api/v1/users`, `/api/v1/settings`) reject any request carrying a client token with `ApiError(403, 'Client users cannot access internal practice management resources')`.
  - **Client Isolation:** All portal controllers query MongoDB with `{ tenantId: req.tenantId, clientId: req.clientId }` to guarantee a client can NEVER read or mutate another client's records.

---

### Part 26: Client Self-Service Compliance, Documents & Billing Hub (Phases 126–130)

#### Phase 126: Client Compliance Calendar & Milestone API
- **Goal:** Give clients transparent visibility into upcoming and completed statutory compliance deadlines.
- **Endpoint:**
  - `GET /api/v1/portal/compliance-calendar`:
    - Protected by `clientAuthMiddleware`.
    - Queries active tasks for `req.clientId` where `serviceId` is linked to statutory compliance (GST, TDS, Advance Tax, Annual ROC).
    - Accepts query params: `year`, `month`, `status` (`'pending' | 'completed' | 'all'`).
    - Returns timeline objects:
      ```typescript
      {
        complianceName: string; // e.g. "GSTR-3B Return Filing (October 2026)"
        serviceCategory: string; // "GST" | "Income Tax" | "ROC"
        dueDate: Date;
        targetDate?: Date;
        status: "Pending" | "In Progress" | "Completed" | "Overdue";
        completedAt?: Date;
        acknowledgementNumber?: string;
      }
      ```

#### Phase 127: Client Documents Repository & Return Vault
- **Goal:** Provide a client repository of finalized government acknowledgments, filed returns, and audit reports with secure 1-click downloads.
- **Endpoints:**
  - `GET /api/v1/portal/documents`:
    - Queries `DocumentRecord` collection filtered by `clientId === req.clientId` and `visibility === 'Client'`.
    - Supports categorization filters: `folder` (`'GST Returns' | 'Income Tax Acknowledgments' | 'Audited Statements' | 'Registrations'`), `search`, and date range.
  - `GET /api/v1/portal/documents/:id/download`:
    - Verifies document ownership (`doc.clientId.equals(req.clientId)`).
    - Logs client download event in `DocumentAccessLog`.
    - Streams file directly or generates pre-signed S3 download URL with 5-minute expiry.

#### Phase 128: Client Invoices, Receipts & Ledger Statement
- **Goal:** Empower clients to view outstanding balances, inspect itemized invoices, download receipts, and view their official ledger.
- **Endpoints:**
  - `GET /api/v1/portal/invoices`:
    - Fetches invoices for `req.clientId` where `status !== 'Draft' && status !== 'Cancelled'`.
    - Returns invoice number, date, due date, items summary, grand total, amount paid, and outstanding balance (`amountDue`).
  - `GET /api/v1/portal/receipts`:
    - Returns payment receipts issued to client with receipt number, payment mode, reference/UTR, and allocations.
  - `GET /api/v1/portal/ledger`:
    - Re-uses client ledger calculation engine (from Phase 47) restricted to `req.clientId`.
    - Returns chronological stream of debit invoices and credit receipts with real-time running balance.
  - `GET /api/v1/portal/invoices/:id/pdf`:
    - Generates downloadable printable invoice PDF with firm letterhead and bank details.

#### Phase 129: Direct Document Request Fulfillment Service
- **Goal:** Allow clients to fulfill pending document requests directly inside their portal workspace.
- **Endpoints:**
  - `GET /api/v1/portal/document-requests`:
    - Fetches pending requests created by firm staff (`status: 'Pending' | 'Partially Uploaded'`).
  - `POST /api/v1/portal/requests/:id/fulfill`:
    - Accepts multipart files using Multer.
    - Saves files into client document folder.
    - Updates `DocumentRequest` status to `'Uploaded'` and records upload timestamp.
    - Triggers internal staff notification: *"Client uploaded requested documents for [Task Name]"*.

#### Phase 130: Client Service Requests & Support Query API
- **Goal:** Allow clients to request new ad-hoc services (e.g., GST registration, trademark filing) or ask questions.
- **Model:** `Backend/src/models/ClientQueryTicket.ts`:
  ```typescript
  export interface IClientQueryTicket extends Document {
    tenantId: mongoose.Types.ObjectId;
    clientId: mongoose.Types.ObjectId;
    clientUserId: mongoose.Types.ObjectId;
    ticketNo: string; // e.g. "TKT-2026-0042"
    type: 'Service Request' | 'Query' | 'Billing Inquiry' | 'Document Submission';
    subject: string;
    message: string;
    attachments?: string[];
    status: 'Open' | 'In Review' | 'Resolved' | 'Closed';
    assignedToUserId?: mongoose.Types.ObjectId;
    resolutionNotes?: string;
    createdAt: Date;
    updatedAt: Date;
  }
  ```
- **Endpoints:**
  - `POST /api/v1/portal/queries`: Creates ticket and auto-notifies assigned accountant.
  - `GET /api/v1/portal/queries`: Lists tickets submitted by current client.

---

### Part 27: Payment Gateway, Dynamic UPI & Instant Reconciliation Engine (Phases 131–135)

#### Phase 131: Payment Gateway Configuration Schema & Keys
- **Goal:** Securely configure payment gateways (Razorpay, Cashfree) and firm UPI VPA IDs per billing entity.
- **Model:** `Backend/src/models/PaymentGatewayConfig.ts`:
  ```typescript
  export interface IPaymentGatewayConfig extends Document {
    tenantId: mongoose.Types.ObjectId;
    billingEntityId: mongoose.Types.ObjectId;
    provider: 'Razorpay' | 'Cashfree' | 'UPI_Direct';
    isEnabled: boolean;
    keyId: string; // Public API Key
    encryptedKeySecret: string; // Encrypted using AES-256-CBC
    iv: string;
    webhookSecret: string; // For HMAC verification
    upiVpa: string; // e.g. "sharmaca@hdfcbank"
    merchantName: string; // e.g. "Sharma & Associates CA"
    acceptedModes: ('UPI' | 'CreditCard' | 'DebitCard' | 'NetBanking')[];
    createdAt: Date;
    updatedAt: Date;
  }
  ```
- **Indexes:** `{ tenantId: 1, billingEntityId: 1, provider: 1 }` (unique).

#### Phase 132: Dynamic UPI QR Code & Payment Link Generator
- **Goal:** Generate NPCI-compliant UPI QR strings and gateway checkout links on unpaid invoices.
- **NPCI Specification:**
  - URI format: `upi://pay?pa={upiVpa}&pn={merchantName}&am={amountDue}&tr={invoiceNo}&tn=Invoice_{invoiceNo}&cu=INR`
- **Endpoints:**
  - `GET /api/v1/invoices/:id/upi-qr`:
    - Checks invoice status (`amountDue > 0`).
    - Constructs NPCI string and generates base64 QR code image using `qrcode` library:
      ```typescript
      const qrDataUrl = await QRCode.toDataURL(upiUri, { errorCorrectionLevel: 'M', margin: 2, scale: 6 });
      ```
    - Returns `{ upiUri, qrBase64: qrDataUrl, amountDue: invoice.totals.amountDue }`.
  - `POST /api/v1/invoices/:id/payment-link`:
    - Invokes Razorpay / Cashfree API to generate online payment link (`https://rzp.io/i/...`).
    - Stores `paymentLinkId` on invoice document for status tracking.
    - Returns checkout URL.

#### Phase 133: Gateway Webhook Receiver & Cryptographic Verification
- **Goal:** Public webhook endpoint securely capturing asynchronous payment events from payment gateways.
- **Endpoint:** `POST /api/v1/payments/webhook`:
  - **Raw Body Capture:** Express middleware configured with `express.raw({ type: 'application/json' })` for webhook route to preserve exact byte sequence.
  - **HMAC Verification:**
    ```typescript
    const signature = req.headers['x-razorpay-signature'] as string;
    const expectedSignature = crypto
      .createHmac('sha256', config.webhookSecret)
      .update(req.rawBody)
      .digest('hex');
    if (signature !== expectedSignature) {
      throw new ApiError(400, 'Invalid webhook signature');
    }
    ```
  - **Idempotency Check:** Checks if `paymentId` / `orderId` has already been processed in `PaymentTransaction` collection to prevent duplicate execution.

#### Phase 134: ACID Auto-Reconciliation & Instant Receipt Generator
- **Goal:** Automatically reconcile paid invoices into ledger records with zero human intervention.
- **Transaction Flow (MongoDB Session):**
  ```typescript
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // 1. Fetch invoice and gateway config
    const invoice = await Invoice.findById(invoiceId).session(session);
    if (invoice.totals.amountDue <= 0) {
      await session.abortTransaction();
      return; // Already settled
    }

    // 2. Generate atomic receipt sequence
    const receiptNo = await getNextReceiptNumber(invoice.tenantId, 'RCT-', session);

    // 3. Create Receipt document
    const receipt = await Receipt.create([{
      tenantId: invoice.tenantId,
      clientId: invoice.clientId,
      receiptNo,
      date: new Date(),
      paymentMode: 'UPI',
      referenceNumber: gatewayPaymentId, // e.g. "pay_O9rK18..."
      totalAmount: paidAmount,
      settlements: [{
        invoiceId: invoice._id,
        settledAmount: paidAmount,
      }],
      notes: `Automated online payment via Gateway (Ref: ${gatewayPaymentId})`,
    }], { session });

    // 4. Update Invoice balances
    invoice.totals.amountPaid += paidAmount;
    invoice.totals.amountDue = Math.max(0, invoice.totals.grandTotal - invoice.totals.amountPaid);
    if (invoice.totals.amountDue === 0) {
      invoice.status = 'Paid';
    } else {
      invoice.status = 'Partially Paid';
    }
    await invoice.save({ session });

    // 5. Commit transaction
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  }
  ```

#### Phase 135: Payment Transactions Ledger & Audit History
- **Goal:** Store transparent audit history of all digital transactions processed through the practice.
- **Model:** `Backend/src/models/PaymentTransaction.ts`:
  ```typescript
  export interface IPaymentTransaction extends Document {
    tenantId: mongoose.Types.ObjectId;
    clientId: mongoose.Types.ObjectId;
    invoiceId: mongoose.Types.ObjectId;
    receiptId?: mongoose.Types.ObjectId;
    gatewayProvider: string;
    gatewayTransactionId: string; // e.g. RZP payment ID
    gatewayOrderId?: string;
    amount: number;
    currency: string;
    paymentMethod: string; // 'UPI' | 'Card' | 'Netbanking'
    status: 'Initiated' | 'Captured' | 'Failed' | 'Refunded';
    errorCode?: string;
    errorDescription?: string;
    rawWebhookPayload?: any;
    createdAt: Date;
    updatedAt: Date;
  }
  ```
- **Endpoints:**
  - `GET /api/v1/payments/transactions`: Filterable list of all gateway payments by status, date, client, and invoice.

---

### Part 28: Global Time Tracking, TopBar Stopwatch & Timesheet Engine (Phases 136–140)

#### Phase 136: Time Tracking Model & Task Log Schema
- **Goal:** Support granular tracking of time spent by practice staff across client tasks and general practice operations.
- **Model:** `Backend/src/models/TimeLog.ts`:
  ```typescript
  export interface ITimeLog extends Document {
    tenantId: mongoose.Types.ObjectId;
    taskId?: mongoose.Types.ObjectId; // Optional: unlinked general office time
    clientId?: mongoose.Types.ObjectId;
    serviceId?: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId; // Staff member who logged time
    date: Date;
    startTime?: Date;
    endTime?: Date;
    durationMinutes: number; // Stored in integer minutes
    isBillable: boolean;
    hourlyBillingRate?: number; // Snapshot of billing rate at time of logging
    description: string;
    approvalStatus: 'Pending' | 'Approved' | 'Rejected';
    approvedByUserId?: mongoose.Types.ObjectId;
    approvedAt?: Date;
    isBilled: boolean;
    invoiceId?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
  }
  ```
- **Task Schema Sync:** Whenever a `TimeLog` is created/updated/deleted for a task, the task's `timeLogged` field is recalculated via atomic aggregation:
  `$set: { timeLogged: sum(durationMinutes) }`.
- **Indexes:**
  - `{ tenantId: 1, userId: 1, date: -1 }`
  - `{ tenantId: 1, taskId: 1 }`
  - `{ tenantId: 1, clientId: 1, isBillable: 1, isBilled: 1 }`

#### Phase 137: Global Stopwatch API (Start, Pause, Resume, Stop)
- **Goal:** Provide a live stopwatch session controlled from the application header, resilient to browser refresh or network disconnection.
- **Model:** `Backend/src/models/ActiveTimer.ts`:
  ```typescript
  export interface IActiveTimer extends Document {
    tenantId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    taskId?: mongoose.Types.ObjectId;
    clientId?: mongoose.Types.ObjectId;
    description?: string;
    isBillable: boolean;
    startedAt: Date;
    accumulatedSeconds: number; // Paused duration accrued
    isPaused: boolean;
    pausedAt?: Date;
  }
  ```
- **Endpoints:**
  - `POST /api/v1/timetracking/start`:
    - Checks if an active timer already exists for `req.user.id`. If exists, auto-stops previous timer or rejects.
    - Creates `ActiveTimer` document with `startedAt: new Date()`.
  - `POST /api/v1/timetracking/pause`:
    - Computes elapsed time since `startedAt` and adds to `accumulatedSeconds`. Sets `isPaused: true`.
  - `POST /api/v1/timetracking/resume`:
    - Resets `startedAt = new Date()` and sets `isPaused: false`.
  - `POST /api/v1/timetracking/stop`:
    - Computes total runtime: `accumulatedSeconds + (now - startedAt)`.
    - Converts to integer minutes (rounded up to nearest minute).
    - Automatically creates a finalized `TimeLog` document.
    - Removes `ActiveTimer` document.
    - Returns `{ loggedMinutes, timeLogId }`.
  - `GET /api/v1/timetracking/active`:
    - Returns current running timer status for authenticated user with server timestamp to synchronize client display.

#### Phase 138: Manual Time Entry & Task Association CRUD
- **Goal:** Allow staff and managers to retroactively log hours, edit mistaken timestamps, or log non-stopwatch time.
- **Endpoints:**
  - `POST /api/v1/tasks/:taskId/timelogs`: Creates manual time log entry associated with a specific task.
  - `GET /api/v1/tasks/:taskId/timelogs`: Lists all time entries recorded on the task with staff avatar and notes.
  - `PUT /api/v1/timelogs/:id`: Edits entry (restricted to log creator or Admin; blocked if `isBilled === true`).
  - `DELETE /api/v1/timelogs/:id`: Deletes entry (recalculates task `timeLogged`).

#### Phase 139: Timesheet Aggregation, Review & Approval Workflow
- **Goal:** Weekly timesheet grid providing team leaders and partners with approval controls for staff payroll and client billing.
- **Endpoints:**
  - `GET /api/v1/timetracking/timesheets`:
    - Aggregates daily logged hours for staff members across a specified week (`startDate` to `endDate`).
    - Groups logs by user, date, task, and billable status.
  - `PATCH /api/v1/timetracking/timesheets/:id/approve`:
    - Admin/Team Leader action marking time log as `Approved`.
  - `PATCH /api/v1/timetracking/timesheets/:id/reject`:
    - Marks time log as `Rejected` with required feedback reason.

#### Phase 140: Staff Utilization & Billable Hours Analytics
- **Goal:** High-level practice intelligence measuring how much staff time converts into billable revenue.
- **Endpoint:** `GET /api/v1/analytics/time-utilization`:
  - **Aggregation Pipeline:**
    - `$match` on date range and tenant.
    - Computes:
      - **Total Hours Logged:** Sum of all staff minutes / 60.
      - **Billable Ratio:** `(Billable Minutes / Total Minutes) * 100`.
      - **Unbilled WIP Exposure:** Sum of `(durationMinutes / 60) * hourlyRate` for all `isBillable: true && isBilled: false`.
      - **Staff Leaderboard:** Top staff by billable hours completed.

---

### Part 29: Enterprise Multi-Branch Billing & SaaS Licensing Enforcement (Phases 141–145)

#### Phase 141: Multi-Branch & Billing Entity Master Schema
- **Goal:** Support accounting practices operating across multiple legal entities (e.g. Audit Firm, Tax Consulting LLP) or multiple regional branches (e.g. Mumbai, Bengaluru, Delhi).
- **Model:** `Backend/src/models/BillingEntity.ts`:
  ```typescript
  export interface IBillingEntity extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchName: string; // e.g. "Mumbai - Main Office", "Bengaluru Tech Hub"
    legalEntityName: string; // e.g. "Sharma & Co. Chartered Accountants"
    gstin: string;
    pan: string;
    stateCode: string; // 2-digit GST state code (e.g., "27" for Maharashtra)
    address: {
      street: string;
      city: string;
      state: string;
      pincode: string;
    };
    contactEmail: string;
    contactPhone: string;
    logoUrl?: string;
    signatureImageUrl?: string;
    bankDetails: {
      bankName: string;
      accountNumber: string;
      ifscCode: string;
      branchName: string;
      upiId?: string;
    };
    invoicePrefix: string; // e.g. "INV-MUM-"
    termsAndConditions?: string;
    isDefault: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }
  ```
- **Indexes:** `{ tenantId: 1, branchName: 1 }` (unique).

#### Phase 142: Branch-Isolated Sequence Generator Service
- **Goal:** Upgrade sequence service so that each Billing Entity maintains its own independent, atomic serial numbering without race conditions.
- **Sequence Logic Upgrade (`sequence.service.ts`):**
  - Collection: `SequenceCounter`
  - Identifier: `{ tenantId, billingEntityId, type: 'Invoice', financialYear: '2026-27' }`.
  - Increment: Atomic MongoDB `$inc: { seq: 1 }` returning zero-padded integer (e.g., `0042`).
  - Output: `${prefix}${financialYear}/${seq}` -> `INV-MUM-26-27/0042`.

#### Phase 143: Cross-Branch Invoicing & Financial Filtering
- **Goal:** Seamlessly select branch profile during invoice creation and filter financial reporting by branch.
- **Endpoints:**
  - `POST /api/v1/invoices` (Enhanced):
    - Accepts optional `billingEntityId`. If omitted, defaults to tenant's default entity.
    - Snapshot: Injects entity's GSTIN, state code, bank details, and logo directly into invoice document snapshot to preserve historical record if entity settings change.
  - `GET /api/v1/reports/branch-sales`:
    - Groups invoices and collections by `billingEntityId`.
    - Generates separate GSTR-1 outward supply summaries per branch GSTIN.

#### Phase 144: SaaS Subscription, Plan Enforcement & Feature Gating
- **Goal:** Model tenant subscription tiers and enforce strict seat limits and feature gates.
- **Model:** `Backend/src/models/TenantSubscription.ts`:
  ```typescript
  export interface ITenantSubscription extends Document {
    tenantId: mongoose.Types.ObjectId;
    planTier: 'Starter' | 'Professional' | 'Enterprise';
    billingCycle: 'Monthly' | 'Annual';
    maxUsers: number; // e.g., Starter: 3, Pro: 10, Enterprise: Unlimited
    maxClients: number; // e.g., Starter: 100, Pro: 1000, Enterprise: Unlimited
    storageLimitGb: number; // Document upload storage limit
    featuresEnabled: {
      clientPortal: boolean;
      timeTracking: boolean;
      multiBranch: boolean;
      customDomain: boolean;
      bulkWhatsApp: boolean;
    };
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    status: 'Active' | 'Past Due' | 'Cancelled';
  }
  ```
- **Middleware:** `Backend/src/middlewares/plan-guard.ts`:
  - `requireFeature(featureKey: string)`: Rejects endpoint if feature is disabled in plan tier.
  - `checkSeatLimit()`: Rejects user creation (`POST /api/v1/users`) if active user count reaches `maxUsers`.
  - `checkClientLimit()`: Rejects client creation (`POST /api/v1/clients`) if client count reaches `maxClients`.

#### Phase 145: Tenant Usage Metrics & Automated Renewal Worker
- **Goal:** Aggregate tenant resource utilization and automate BullMQ alerts when plans approach expiration or limits.
- **Endpoints:**
  - `GET /api/v1/tenant/usage`:
    - Computes active staff count vs `maxUsers`.
    - Computes total clients vs `maxClients`.
    - Computes total file storage used (sum of document bytes / 1GB).
    - Returns percentage utilization indicators.
- **BullMQ Daily Worker:**
  - `tenant-renewal.worker.ts`:
    - Scans tenants expiring in 7, 3, and 1 day(s).
    - Dispatches renewal reminder emails and in-app banner alerts to Super Admins.

---

## 4. Backend Implementation Directory Layout

```
Backend/
├── src/
│   ├── models/
│   │   ├── ClientUser.ts                   # Phase 121 (Portal Users)
│   │   ├── TenantWebsiteSettings.ts        # Phase 123 (White-Label CMS)
│   │   ├── ClientQueryTicket.ts            # Phase 130 (Client Support Queries)
│   │   ├── PaymentGatewayConfig.ts         # Phase 131 (Gateway & UPI Keys)
│   │   ├── PaymentTransaction.ts           # Phase 135 (Transaction Ledger)
│   │   ├── TimeLog.ts                      # Phase 136 (Staff Time Logs)
│   │   ├── ActiveTimer.ts                  # Phase 137 (Live Stopwatch)
│   │   ├── BillingEntity.ts                # Phase 141 (Multi-Branch Entities)
│   │   └── TenantSubscription.ts           # Phase 144 (SaaS Plans & Limits)
│   │
│   ├── middlewares/
│   │   ├── client-auth.ts                  # Phase 125 (Client Portal Auth & Isolation)
│   │   └── plan-guard.ts                   # Phase 144 (SaaS Quota & Tier Gating)
│   │
│   ├── controllers/
│   │   ├── portal-auth.controller.ts       # Phase 122 (Client Login & OTP)
│   │   ├── portal-data.controller.ts       # Phase 126-130 (Calendar, Docs, Billing)
│   │   ├── payment.controller.ts           # Phase 132-135 (UPI, Webhook, Settle)
│   │   ├── timetracking.controller.ts      # Phase 137-140 (Stopwatch & Timesheets)
│   │   └── billing-entity.controller.ts    # Phase 141-143 (Multi-Branch CRUD)
│   │
│   ├── services/
│   │   ├── client-auth.service.ts          # Phase 122 (OTP Generation & JWT)
│   │   ├── upi-payment.service.ts          # Phase 132 (NPCI QR & Razorpay Link)
│   │   ├── payment-reconcile.service.ts    # Phase 134 (ACID Auto-Settlement)
│   │   ├── timer.service.ts                # Phase 137 (Drift-Free Server Clock)
│   │   └── sequence.service.ts             # Phase 142 (Upgraded Multi-Entity Sequences)
│   │
│   ├── routes/
│   │   ├── portal-auth.routes.ts           # Phase 122
│   │   ├── portal.routes.ts                # Phase 126-130
│   │   ├── payment.routes.ts               # Phase 132-135
│   │   ├── timetracking.routes.ts          # Phase 137-140
│   │   └── billing-entity.routes.ts        # Phase 141-143
│   │
│   └── queues/
│       ├── payment-webhook.queue.ts        # Phase 134
│       └── tenant-renewal.worker.ts        # Phase 145
```

---

## 5. Verification & Testing Matrix

### Automated Integration Test Plan
1. **Client Portal Security Test:** Verify that a JWT carrying `role: 'Client'` receives `403 Forbidden` on `/api/v1/tasks` or `/api/v1/users`, but successfully fetches compliance calendar on `/api/v1/portal/compliance-calendar`.
2. **Cross-Tenant Client Isolation Test:** Ensure Client User in Tenant A cannot query documents or invoices belonging to Tenant B, even if ID is known.
3. **Webhook Cryptographic Test:** Verify that `POST /api/v1/payments/webhook` rejects forged payloads, but valid HMAC-SHA256 signatures trigger the ACID transaction, updating invoice to `Paid` and creating `Receipt`.
4. **Stopwatch Drift Test:** Start a timer at $T_0$, pause at $T_0 + 60\text{s}$, resume at $T_0 + 120\text{s}$, stop at $T_0 + 180\text{s}$. Assert duration equals exactly 2 minutes (120 seconds).
5. **Multi-Branch Isolation Test:** Create Invoice for Branch 1 and Branch 2. Verify sequential numbers increment independently (`INV-MUM-001`, `INV-BLR-001`).
6. **Plan Limit Quota Test:** On a tenant with `maxUsers: 3`, attempt to register a 4th user and verify that `ApiError(403, 'User limit reached for current subscription plan')` is thrown.
