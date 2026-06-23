# Proactive SaaS — Phase 1 Implementation Plan & Frontend Architecture

> **Scope**: Phase 1 MVP — Auth, Users, RBAC, Clients, Services, Tasks, Invoicing, Receipts, Ledger, Settings  
> **Stack**: React (Vite) · React Router · Context API · Axios · CSS  
> **Decisions Applied**: Single Page Application (SPA), Context-based state management, Permission-driven UI rendering.

---

## Table of Contents

1. [Frontend Project Structure](#1-frontend-project-structure)
2. [State Management Strategy](#2-state-management-strategy)
3. [Routing & Protected Routes](#3-routing--protected-routes)
4. [Authentication & Token Management](#4-authentication--token-management)
5. [API Integration Layer](#5-api-integration-layer)
6. [Component Architecture](#6-component-architecture)
7. [Permission Gate Logic](#7-permission-gate-logic)
8. [Phase 1 Pages Breakdown](#8-phase-1-pages-breakdown)

---

## 1. Frontend Project Structure

```text
client/
├── public/
├── src/
│   ├── api/                         # Axios instances + API service methods
│   │   ├── axiosInstance.js         # Configured with base URL and interceptors
│   │   ├── auth.api.js
│   │   ├── client.api.js
│   │   └── ...
│   ├── assets/                      # Images, icons, global styles
│   ├── components/                  # Reusable UI components
│   │   ├── layout/                  # TopBar, Sidebar, MainLayout
│   │   ├── ui/                      # Button, Input, Modal, Table, Skeleton
│   │   └── shared/                  # PermissionGate, StatusBadge
│   ├── contexts/                    # Global State
│   │   ├── AuthContext.jsx          # Manages user session & tokens
│   │   ├── PermissionsContext.jsx   # Manages loaded RBAC permissions
│   │   └── MastersContext.jsx       # Caches master data (Tags, Groups)
│   ├── hooks/                       # Custom hooks
│   │   ├── useAuth.js
│   │   ├── usePermissions.js
│   │   └── ...
│   ├── pages/                       # Route-level components grouped by feature
│   │   ├── Auth/                    # Login, Forgot Password
│   │   ├── Dashboard/               # Main stats
│   │   ├── Clients/                 # Client List, Client Detail
│   │   ├── Tasks/                   # Kanban / List view
│   │   └── ...
│   ├── routes/                      # Route definitions
│   │   ├── AppRoutes.jsx
│   │   └── PrivateRoute.jsx
│   ├── utils/                       # Formatters, date helpers, validators
│   │   ├── formatCurrency.js
│   │   └── dateUtils.js
│   ├── App.jsx
│   └── main.jsx
├── package.json
└── vite.config.js
```

---

## 2. State Management Strategy

For Phase 1 MVP, we will rely on **React Context API** coupled with standard React hooks to manage global state. This avoids the overhead of complex state libraries while keeping the architecture clean.

### Core Contexts:
1. **AuthContext**: Holds the authenticated user's profile, tenant information (`tenantId`), and authentication status.
2. **PermissionsContext**: Fetches and stores the logged-in user's role and permission matrix. This is critical for conditional UI rendering.
3. **MasterDataContext**: Caches frequently used master data (e.g., Tags, Client Groups, Payment Modes) to prevent redundant API calls across different pages.

---

## 3. Routing & Protected Routes

We will use **React Router (v6+)** for client-side routing.

### Route Protection Strategy:
- **Public Routes**: accessible to unauthenticated users (e.g., `/login`, `/forgot-password`).
- **Private Routes**: wrapped in a `<PrivateRoute>` component that checks for an active session. If unauthenticated, it redirects to `/login`.
- **Role-Based Routes**: For pages entirely restricted by role, `<PrivateRoute>` will also check against the `PermissionsContext` to ensure the user has the required module access.

```jsx
// Example PrivateRoute implementation concept
const PrivateRoute = ({ children, requiredModule }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const { hasModuleAccess } = usePermissions();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requiredModule && !hasModuleAccess(requiredModule)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};
```

---

## 4. Authentication & Token Management

### Flow:
1. User submits credentials on the Login page.
2. API returns an `accessToken` (short-lived) in the JSON response and sets a `refreshToken` (HttpOnly cookie).
3. The `accessToken` is stored in memory (or `localStorage`) and injected into the `AuthContext`.
4. An Axios Interceptor automatically attaches the `Authorization: Bearer <token>` header to all outgoing API requests.

### Token Refresh Mechanism:
- An Axios response interceptor catches `401 Unauthorized` errors globally.
- If a 401 occurs, it pauses the request queue and triggers a call to the `/auth/refresh` endpoint to get a new `accessToken`.
- If the refresh succeeds, the original requests are retried.
- If the refresh fails (token expired/invalid), the user is logged out and redirected to `/login`.

---

## 5. API Integration Layer

All API calls will be centralized in the `src/api` directory using a configured Axios instance. This ensures base URLs, headers, and error handling logic are consistent across the entire application.

```javascript
// src/api/axiosInstance.js
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // Required to send and receive HttpOnly refresh cookies
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for automatic token refresh goes here
export default api;
```

---

## 6. Component Architecture

We will follow a structured component design principle:
- **UI Components (`src/components/ui`)**: Dumb, reusable, stateless components like Buttons, Inputs, Modals, DataTables, and Loading Skeletons.
- **Shared Components (`src/components/shared`)**: Components with some business logic but used across features, like `PermissionGate`, `StatusBadge`, or `AsyncSelect` (dropdowns that fetch their own options).
- **Layout Components (`src/components/layout`)**: Structural components like the `Sidebar` (which dynamically renders navigation items based on user permissions) and the `TopBar`.

---

## 7. Permission Gate Logic

> [!CAUTION]
> The UI must cleanly hide buttons, links, and actions the user is not authorized to perform. This provides a better UX and prevents unauthorized API calls from the client side.

We implement a `<PermissionGate>` wrapper component to conditionally render UI elements based on the RBAC matrix fetched during authentication.

```jsx
const PermissionGate = ({ module, action, children }) => {
  const { permissions } = usePermissions();
  
  // Checks the deeply nested permission structure: permissions.client.create.allowed
  const isAllowed = permissions?.[module]?.[action]?.allowed;
  
  if (!isAllowed) return null;
  
  return children;
};

// Usage Example
<PermissionGate module="client" action="create">
  <Button onClick={openCreateModal}>New Client</Button>
</PermissionGate>
```

---

## 8. Phase 1 Pages Breakdown

1. **Authentication**
   - Login Page
   - Reset Password Page
2. **Dashboard**
   - High-level metrics (Active tasks count, Pending Invoices total, etc.)
3. **Clients Module**
   - Client List (DataTable with robust search, filtering, and pagination)
   - Client Detail View (Tabbed interface for Profile, Tasks, Invoices, Documents)
4. **Services & Tasks Module**
   - Service Catalog List
   - Task Board (Kanban view for task progression) & List view
   - Task Detail Modal (Checklist tracking, Time log entries, Notes/Comments)
5. **Billing & Financials**
   - Invoices List & Invoice Generator Form
   - Receipts List & Receipt Creator
   - Client Ledger View (Transactions history)
6. **Settings & Masters**
   - Organization Profile Settings
   - User Management (Add/Edit users, assign roles)
   - Roles & Permissions Builder UI (Matrix toggles)
   - Master Data Management (Manage Tags, Client Groups, Expense Categories)
