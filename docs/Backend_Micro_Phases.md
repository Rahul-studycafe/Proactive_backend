# Proactive SaaS — Backend Micro-Phase Architecture Plan

This document divides the Phase 1 MVP Backend into 48 micro-phases. Each phase represents the smallest possible unit of functional work that can be built and **independently tested** via Postman, cURL, or automated tests. This strategy ensures a rock-solid foundation, prevents massive PRs, and mitigates integration bugs.

---

## Part 1: Core Foundation & Tooling (Phases 1-3)

### Phase 1: Project Initialization & Express Setup
- **Goal:** Setup standard Express/TypeScript structure, `.env` file, basic `app.ts` and `server.ts`. Initialize `package.json` with standard scripts (`dev`, `build`, `start`, `lint`, `test`, `prepare`).
- **Dependencies Setup:**
  - **Required for Phase 1 MVP:** `express`, `mongoose`, `dotenv`, `cors`, `helmet`, `zod` (for validation), `jsonwebtoken`. *(Note: You should also add `bcrypt` or `bcryptjs` for password hashing in Phase 6).*
  - **Deferred (For Later Phases):** `bullmq` (background tasks), `firebase-admin` (push notifications), `razorpay` (subscriptions), `socket.io` (real-time). You can include them now in `package.json` but they won't be actively used in early phases.
  - **Dev Dependencies:** `typescript`, `ts-node-dev`, `jest`, `supertest`, `eslint`, `prettier`, `husky`, `lint-staged`, and associated `@types/*`.
- **Test:** Run `npm run dev` (which runs `ts-node-dev`), send `GET /` and receive a `200 OK` health check.

### Phase 2: Database Connection & Global Error Handler
- **Goal:** Configure Mongoose connection with retry logic. Setup global `errorHandler.js`.
- **Test:** Force a connection error to see retry logs. Trigger a dummy route that throws an error and verify it returns a standard JSON error response.

### Phase 3: API Utility Classes
- **Goal:** Implement `ApiResponse.js`, `ApiError.js`, and `asyncHandler.js`.
- **Test:** Create a dummy route wrapped in `asyncHandler` that throws an `ApiError`. Verify standard JSON format.

---

## Part 2: Security & Multi-Tenancy Core (Phases 4-8)

### Phase 4: Basic Models (Organization & BillingEntity)
- **Goal:** Implement the Mongoose schemas for `Organization` and `BillingEntity`.
- **Test:** Write a quick unit test or script to save and retrieve an Organization.

### Phase 5: TenantSettings Model
- **Goal:** Implement the `TenantSettings` schema to hold global config (e.g. `clientCustomFields`).
- **Test:** Script to insert a dummy `TenantSettings` document.

### Phase 6: Role & User Models
- **Goal:** Implement `Role` and `User` schemas. Add `bcrypt` pre-save hook on the User model.
- **Test:** Save a User document. Fetch it directly from DB and verify `password` is hashed.

### Phase 7: Auth Service (JWT Utilities)
- **Goal:** Create functions to generate Access and Refresh tokens (`auth.service.js`).
- **Test:** Run a unit test generating and verifying a JWT against your secret key.

### Phase 8: Registration Endpoint (`POST /auth/register`)
- **Goal:** Orchestrate the creation of an Organization, Super Admin Role, User, default BillingEntity, and TenantSettings.
- **Test:** Send a `POST` request via Postman. Verify a 201 response containing tokens and verify all 5 documents exist in the DB.

---

## Part 3: Authentication & Authorization Flow (Phases 9-16)

### Phase 9: Login Endpoint (`POST /auth/login`)
- **Goal:** Verify username/password + org slug. Issue tokens.
- **Test:** Postman: Attempt login with valid credentials (success) and invalid (401 error).

### Phase 10: Auth Middleware
- **Goal:** Intercept requests, verify JWT, fetch User (hydrate `req.user`), check `tokenVersion`.
- **Test:** Create a protected dummy route. Hit it with and without a valid token.

### Phase 11: Tenant Scope Middleware
- **Goal:** Extract `tenantId` from `req.user` and strictly inject it into `req.tenantId`.
- **Test:** Hit a protected route, verify `req.tenantId` is logged in the console.

### Phase 12: Token Refresh & Logout Endpoints
- **Goal:** `POST /auth/refresh` to get a new access token. `POST /auth/logout` to clear refresh token.
- **Test:** Use expired access token (fails), use refresh token to get a new access token (succeeds).

### Phase 13: Authorize Middleware (RBAC Matrix)
- **Goal:** Implement `authorize(module, action)` to check the Role's permission matrix. Bypass if Super Admin.
- **Test:** Attempt to hit a route requiring `client.create` using a user with and without the permission.

### Phase 14: Authorize Middleware (SBAC Scoping)
- **Goal:** Enhance `authorize` to inject `req.permissionScope` and `req.scopeFilter` for `team_only` or `assigned_only`.
- **Test:** Verify `req.scopeFilter` outputs `{ assignedUserId: ... }` when scope is restricted.

### Phase 15: User Profile API (`GET /auth/me`)
- **Goal:** Return current user details, hydrated role, and permissions.
- **Test:** Postman: `GET /auth/me` with Bearer token. Verify full permission matrix is returned.

### Phase 16: Rate Limiting Middleware
- **Goal:** Implement per-tenant / per-IP rate limiting to protect auth endpoints.
- **Test:** Spam the login endpoint 100 times and verify a `429 Too Many Requests` status.

---

## Part 4: User & Role Management (Phases 17-21)

### Phase 17: User Creation API (`POST /users`)
- **Goal:** Endpoint to invite/create a new user in the tenant.
- **Test:** Admin calls `POST /users` (success). Non-admin calls it (403 Forbidden).

### Phase 18: User Read APIs (`GET /users`, `GET /users/:id`)
- **Goal:** List users with pagination, and fetch a single user. Ensure `tenantId` is enforced.
- **Test:** Verify only users from the specific `tenantId` are returned.

### Phase 19: User Update & Deactivation API
- **Goal:** `PUT /users/:id` to update user. Implement deactivation (increment `tokenVersion`).
- **Test:** Deactivate a user. Attempt to use their old JWT and verify it is rejected.

### Phase 20: Role Creation & Update API
- **Goal:** `POST` and `PUT` `/roles` to create custom roles and update the permission matrix.
- **Test:** Create an "Accountant" role with limited matrix. Verify JSON schema validates the matrix shape.

### Phase 21: Role Read APIs
- **Goal:** `GET /roles` and `GET /roles/:id`.
- **Test:** Fetch roles, ensure Super Admin role is protected from deletion.

---

## Part 5: Masters & Settings (Phases 22-26)

### Phase 22: Master Models 1 (Tags & ClientGroups)
- **Goal:** Create schemas and generic CRUD controllers for Tags and ClientGroups.
- **Test:** Standard CRUD validation via Postman.

### Phase 23: Master Models 2 (PaymentModes & ExpenseCategories)
- **Goal:** Create schemas and generic CRUD controllers for PaymentModes and ExpenseCategories.
- **Test:** Standard CRUD validation via Postman.

### Phase 24: Master Models 3 (Holidays & DocumentTypes)
- **Goal:** Create schemas and generic CRUD controllers for Holidays and DocumentTypes.
- **Test:** Standard CRUD validation via Postman.

### Phase 25: Master Bootstrap API (`GET /masters/bootstrap`)
- **Goal:** Combine all masters, billing entity, and tenant settings into a single payload.
- **Test:** Call endpoint and verify payload size & structure.

### Phase 26: Tenant Custom Fields Definition API
- **Goal:** APIs to add/edit/remove client custom field definitions in `TenantSettings`.
- **Test:** Add a "GSTIN" field definition. Fetch bootstrap and verify it appears.

---

## Part 6: CRM - Clients & Services (Phases 27-33)

### Phase 27: Client Model
- **Goal:** Implement `Client` schema supporting dynamic `customFieldValues` (Map).
- **Test:** Unit test to save a client with a custom field `{"GSTIN": "22AAAAA0000A1Z5"}`.

### Phase 28: Client Creation API (`POST /clients`)
- **Goal:** Endpoint to create a client, validating against required custom fields.
- **Test:** Postman test to create a client successfully.

### Phase 29: Client Read APIs (`GET /clients`)
- **Goal:** Implement pagination, sorting, and debounced search. Apply RBAC `client.view` constraints.
- **Test:** Search by `fileNo` and verify correct results.

### Phase 30: Client Update & Delete APIs
- **Goal:** `PUT /clients/:id` and soft `DELETE /clients/:id`.
- **Test:** Verify a soft-deleted client does not appear in `GET /clients` by default.

### Phase 31: Service Model
- **Goal:** Implement `Service` schema including the `checklist` array subdocument.
- **Test:** Unit test to save a service with 3 checklist steps.

### Phase 32: Service Creation API (`POST /services`)
- **Goal:** Create a service with predefined checklist logic.
- **Test:** Submit a JSON payload with `checklist: [{ stepName: 'Filing', orderIndex: 1 }]`.

### Phase 33: Service Read & Update APIs
- **Goal:** List active services for dropdowns, and full configuration updates.
- **Test:** Verify update accurately overwrites checklist array.

---

## Part 7: Operations - Task Management (Phases 34-39)

### Phase 34: Task Model
- **Goal:** Implement `Task` schema, referencing `Client` and `Service`.
- **Test:** Unit test checking compound indexes on `tenantId` and `status`.

### Phase 35: Task Creation API (`POST /tasks`)
- **Goal:** Endpoint that copies the checklist from the `Service` directly into the new `Task` instance.
- **Test:** Create a task linked to a service. Fetch the task and verify the checklist was duplicated.

### Phase 36: Task Read APIs & Scope Enforcement
- **Goal:** `GET /tasks` with extensive filtering (date, client, service). Enforce `req.scopeFilter` from Phase 14.
- **Test:** Fetch tasks as an Accountant restricted to `assigned_only`. Verify you only see your tasks.

### Phase 37: Task Update & Status Transition APIs
- **Goal:** Update task details. Validate status changes (e.g., cannot complete if checklist not complete).
- **Test:** Attempt to set status to "Completed" with pending checklist steps (expect 400 Error).

### Phase 38: Task Checklist API (`PATCH /tasks/:id/checklist/:stepIndex`)
- **Goal:** Toggle a specific checklist step status and record `completedBy` and `completedAt`.
- **Test:** Toggle a step and verify the logged user is correct.

### Phase 39: Task Notes API
- **Goal:** `POST` and `DELETE` notes embedded inside a task document.
- **Test:** Add a note, verify it populates `createdBy` via Mongoose population.

---

## Part 8: Financials - Billing & Invoicing (Phases 40-43)

### Phase 40: Invoice Model & Sequence Generator
- **Goal:** `Invoice` schema and `services/sequence.service.js` to safely auto-increment invoice numbers (INV-001).
- **Test:** Call sequence generator concurrently 3 times and ensure no duplicate numbers.

### Phase 41: Unbilled Tasks API (`GET /billing/unbilled`)
- **Goal:** Fetch completed, unbilled tasks for a specific client to construct an invoice.
- **Test:** Create a completed task. Fetch unbilled. It should appear.

### Phase 42: Invoice Creation API (`POST /invoices`)
- **Goal:** Save Invoice. **Crucial Post-Save Hook:** Cascade update all linked tasks to `isBilled: true` and `invoiceId`.
- **Test:** Create invoice. Fetch the linked tasks directly and verify `isBilled` is `true`.

### Phase 43: Invoice Read, Update & Cancel APIs
- **Goal:** `GET /invoices`. `PUT` (for Drafts only). `DELETE` (Cancel invoice and revert task `isBilled` to `false`).
- **Test:** Cancel an invoice. Verify the linked tasks revert to `isBilled: false` and show up in unbilled again.

---

## Part 9: Financials - Receipts & Ledger (Phases 44-48)

### Phase 44: Receipt Model & Unpaid Invoices API
- **Goal:** `Receipt` schema. Endpoint to fetch invoices with `status !== Paid` for a specific client.
- **Test:** Fetch unpaid invoices for a client with an outstanding invoice.

### Phase 45: Receipt Creation API (MongoDB Transactions)
- **Goal:** Most critical phase. Create Receipt + Increment Receipt Number + Update Invoice `amountPaid` + Update Invoice `status`. Must use `session.startTransaction()`.
- **Test:** Simulate a crash halfway through settlement. Verify the receipt is not saved and the invoice is untouched (Rollback success).

### Phase 46: Auto-Settle Algorithm API
- **Goal:** Allow user to submit a lump sum receipt, auto-distributing settlement to oldest invoices first.
- **Test:** Create 2 invoices ($100, $200). Submit $150 receipt. Invoice 1 = Paid, Invoice 2 = Partially Paid ($50 paid).

### Phase 47: Ledger Calculation API (`GET /ledger/:clientId`)
- **Goal:** Fetch both Invoices and Receipts for a client, merge them chronologically, and calculate the running balance server-side.
- **Test:** Validate math against complex historical data (Invoice -> Receipt -> Invoice -> Partial Receipt).

### Phase 48: Dashboard Widget Data API (`GET /dashboard/overview`)
- **Goal:** Aggregate top-level metrics using MongoDB `$facet` (Total Receivables, Overdue Invoices, Pending Tasks).
- **Test:** Call API, compare response counts to actual data counts in collections.
