# Proactive SaaS — Backend System Architecture

This document serves as the living technical documentation for the Proactive SaaS Backend. It reflects the current state of the codebase up to **Phase 9** of the development plan.

---

## 1. Tech Stack & Core Configuration
- **Runtime:** Node.js
- **Framework:** Express.js (with TypeScript)
- **Database:** MongoDB (via Mongoose)
- **Authentication:** JWT (Access & Refresh tokens)
- **Validation:** Zod
- **Testing:** Jest + Supertest

### Standard Scripts
- `npm run dev`: Runs the server in development mode using `ts-node-dev`.
- `npm run build`: Compiles TypeScript to JavaScript in the `dist/` directory.
- `npm run lint`: Runs ESLint for code quality checks.
- `npm run test`: Runs Jest test suites.
- `npm run test -- --coverage`: Runs tests and generates a coverage report.

---

## 2. Multi-Tenancy Architecture (Pooled Database Model)

The application uses a **Pooled Database Model** with **Logical Separation** for multi-tenancy. All tenants share the same database, but every document is strictly tagged with a `tenantId`.

### How Data Isolation Works
1. **Request Context:** The application uses `AsyncLocalStorage` (`src/utils/tenantContext.ts`) to store the `tenantId` globally for the lifecycle of an incoming HTTP request.
2. **Authentication Middleware:** When a request hits a protected route, `src/middlewares/authenticate.ts` extracts the JWT, verifies it, and places the `tenantId` into the `AsyncLocalStorage` context.
3. **Mongoose Plugin:** `src/plugins/tenantPlugin.ts` is applied to all tenant-scoped schemas. 
   - On **save()**, it automatically injects `tenantId` into the document if missing.
   - On **find() / update() / delete()**, it automatically appends `{ tenantId: currentTenantId }` to the query filter.
4. **Result:** The frontend never sends `tenantId`. A user belonging to Tenant A can mathematically never read, update, or delete data belonging to Tenant B.

*Note: For system-level queries (like checking uniqueness during registration before a tenant context exists), queries bypass the plugin using `.setOptions({ skipTenantPlugin: true })`.*

---

## 3. Database Models

### 1. Organization (`Organization.ts`)
Represents the tenant itself. This is the **only** model that is not scoped by `tenantId` (because its `_id` *is* the `tenantId`).
- Contains: `name`, `slug` (unique identifier), `email`, `phone`, `website`, `logoUrl`, `plan` details.

### 2. TenantSettings (`TenantSettings.ts`)
Global configurations specific to a tenant.
- Contains: `tenantId`, `clientCustomFields` (dynamic fields), `allowDuplicateClientNames`, `defaultGstPercentage`.

### 3. Role (`Role.ts`)
Role-Based Access Control (RBAC) definition for a tenant.
- Contains: `tenantId`, `name`, `description`, `isSuperAdmin` (boolean override), `permissions` (matrix of allowed actions).

### 4. User (`User.ts`)
Staff members and administrators belonging to a tenant.
- Contains: `tenantId`, `name`, `username`, `email`, `password` (hashed via pre-save hook), `roleId`, `isActive`, `tokenVersion` (used to invalidate tokens).
- Methods: `comparePassword(candidatePassword)`

### 5. BillingEntity (`BillingEntity.ts`)
The legal entity under which invoices and receipts are issued for the tenant.
- Contains: `tenantId`, `name`, `gstin`, `pan`, `address`, invoice/receipt prefixes and next numbers.
- Hooks: Synchronizes fields like `name`, `gstin`, `address` with the `Organization` upon creation/update.

---

## 4. Authentication & Security Flow

### Endpoints
- **`GET /api/v1/health`**:
  - Public route that returns server health, uptime, memory usage, and database connection status.
- **`POST /api/v1/auth/register`**:  
  - Orchestrates the creation of an Organization.
  - Generates a default BillingEntity and TenantSettings.
  - Creates a "Super Admin" Role.
  - Creates the first User (Super Admin) and hashes their password.
  - Returns JWT Access and Refresh Tokens.
- **`POST /api/v1/auth/login`**:
  - Validates `orgSlug`, `username`, and `password`.
  - Returns JWT Access and Refresh Tokens.
- **`POST /api/v1/auth/refresh`**:
  - Accepts a valid Refresh Token.
  - Checks if the token is valid, matches the database, and `tokenVersion` hasn't changed.
  - Returns a new Access Token.
- **`POST /api/v1/auth/logout`**:
  - Protected route requiring a valid Access Token.
  - Clears the Refresh Token from the user's database record to invalidate it server-side.

### Tokens (`src/services/auth.service.ts`)
- **Access Token:** Short-lived (e.g., 15 minutes). Contains `userId`, `tenantId`, and `roleId`.
- **Refresh Token:** Long-lived (e.g., 7 days). Contains `userId` and `tokenVersion`.

### Token Versioning
If a user is deactivated or needs to be forcefully logged out across all devices, their `tokenVersion` in the DB is incremented. The `authenticate` middleware checks the JWT's `tokenVersion` against the DB. If they don't match, the token is instantly invalidated.

---

## 5. API Utilities

- **`ApiError`**: Standardized custom error class extending `Error`. Used to throw predictable HTTP errors (e.g., `new ApiError(404, 'User not found')`).
- **`ApiResponse`**: Formatter for standardizing JSON success/error responses (`sendSuccess`, `sendError`).
- **`asyncHandler`**: A wrapper for Express async route controllers. It automatically catches Promise rejections and forwards them to the global error handler, eliminating the need for `try/catch` blocks in every controller.
- **`errorHandler`**: The global error catching middleware that formats all unhandled exceptions into the standard `ApiResponse.sendError` format.

---

*This document will be continuously updated as new Micro-Phases are implemented.*
