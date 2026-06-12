# Module 1: Dashboard Overview & Global Navigation

## 1.1. Global Navigation & Top Bar

**Description:** The persistent header visible across all screens of the application, providing global actions and context.

**UI Components & User Stories:**

* **Sidebar Toggle:** As a user, I can collapse or expand the left sidebar to maximize my workspace.
* **Global Search:** As a user, I can use the "Search Clients" input field to quickly find and navigate to a specific client's profile from any page.
* **Active Context:** As a user, I can see my current Organization Name (e.g., "Mative & Co") displayed in the header.
* **Quick Actions:**
* **What's New:** A button to view application updates or release notes.
* **Global Timer:** A clock icon to quickly start/stop a time-tracking session for a task.
* **Notifications:** A bell icon to view recent system alerts (e.g., assigned tasks, client document uploads).
* **Help/Support:** A question mark icon linking to documentation or support.


* **User Profile:** An avatar with a dropdown menu for accessing personal settings, profile details, or logging out.

**MERN Implementation Notes:**

* **Frontend (React):** The Top Bar should be a layout component (`<TopNavigationBar/>`) wrapping the main `Outlet` (if using React Router v6).
* **State Management:** The global search will require a debounced API call (e.g., using `lodash.debounce`) to query the `Clients` collection as the user types, returning a dropdown list of matching results.

---

## 1.2. Left Sidebar Navigation

**Description:** The primary navigation menu granting access to all core modules of the application.

**UI Components & Features:**

* **Active State Tracking:** Visually indicates the current page (e.g., "Dashboard" is highlighted with a blue background).
* **Quick Add Buttons (`+` icons):** Inline buttons next to specific menu items allowing users to bypass the list view and immediately create a new record. Applicable for:
* Tasks
* To-Do
* Clients
* Invoices
* Receipts
* Quotations
* Expenses


* **Categorized Navigation Links:** Links to Client Packages (marked with a "New" badge), Services & Packages, Attendance, Users, Send Notifications, Settings, and an external link icon for "Your Website".
* **Expandable Menus (`>` icons):** Accordion-style sub-menus for grouped items like "Documents & DSC" and "Reports".

**MERN Implementation Notes:**

* **Frontend (React):** Build a generic `<SidebarItem/>` component that accepts props for icon, label, path, `hasQuickAdd` boolean, and `badge` text to keep the code DRY (Don't Repeat Yourself).

---

## 1.3. Dashboard Widgets (The Main Canvas)

**Description:** The core landing page providing a high-level, data-driven summary of agency operations, performance, and outstanding work.

### 1.3.1. "Need to make invoice" Widget

* **Purpose:** Alerts the user to unbilled, completed work.
* **Data Points:** Displays integer counts for unbilled "Packages" and unbilled "Tasks" (e.g., 16 Packages, 109 Tasks).
* **Action:** Clicking the widget should ideally route the user to the invoice generation queue.

### 1.3.2. "Best Performer" Widget

* **Purpose:** Gamified performance tracking for agency staff.
* **Data Points:** A tabular list showing User Avatar, Name, Role (e.g., Accountant, Admin), Total Assigned Tasks, Completed Tasks, and a Completion Percentage (%).
* **Interactivity:** A date-range dropdown filter (e.g., "Last Month", "This Week").

### 1.3.3. "Attendance" Widget

* **Purpose:** Quick overview of staff availability.
* **Data Points:** A tabular list showing User Avatar, Name, Role, Days/Hours Present, Days/Hours Absent, and an Attendance Percentage (%).
* **Interactivity:** A date-range dropdown filter (e.g., "All Time", "This Month").

### 1.3.4. "New Clients" Distribution Widget

* **Purpose:** Visualizes the breakdown of the agency's client base by entity structure.
* **Data Points:** Total count badge (e.g., "43") next to the title. A multi-colored semi-donut chart categorizing clients (Sole Proprietorship, Private Limited, Individual, One Person Company, Partnership Firm, Trust, NGO).
* **Interactivity:** A calendar icon for date filtration. Hovering over chart segments should show exact numbers.

### 1.3.5. Time Tracking Summary Widget

* **Purpose:** Displays overall agency efficiency.
* **Data Points:** Large typographic display of hours/minutes (e.g., "88:35 Hours") representing the average time spent to complete a task within a specific rolling period (e.g., "last 30 days").

### 1.3.6. Useful Links Widget

* **Purpose:** Quick access to frequently used administrative actions.
* **Data Points:** Static or permission-based list of hyperlinks (Website Settings, Renew/Upgrade Plan, Buy SMS, WhatsApp API, Download Website Flyer).

### 1.3.7. Upcoming Holidays Widget

* **Purpose:** Displays the next scheduled office closures.
* **Data Points:** A list of upcoming dates and holiday names. Must support a visual empty state ("There are no Data") when no holidays are upcoming.

---

## 1.4. MERN Architectural Strategy for the Dashboard

To build this dashboard efficiently and prevent it from crushing your database performance, follow these architectural guidelines:

**1. The "Single Endpoint" Strategy (Backend)**
Do not make 6 separate API calls from the React frontend to load the 6 widgets. This creates a waterfall effect and slows down initial rendering.

* Create a dedicated route: `GET /api/v1/dashboard/overview`
* Use `Promise.all()` in your Node.js controller to run the MongoDB queries concurrently.
* Return a single, structured JSON object containing all the data blocks needed for the page.

**2. Heavy Reliance on MongoDB Aggregation Pipelines**
Calculating things like "Best Performer" percentages and "Client Entity" distributions should happen in the database, not in the Node.js memory, and certainly not in the React frontend.

* **For the Client Chart:** Use an aggregation pipeline with `$group` by `entityType` and `$count` to generate the chart data directly.
* **For Best Performers:** Use `$lookup` to join Users and Tasks, then `$project` to calculate the math (`(completedTasks / totalTasks) * 100`).

3. Frontend Component Isolation (Continued)

Skeleton Loaders: Because you are pulling all this data from a single API endpoint to optimize performance, implement Skeleton UI loaders. While the API request is pending, display pulsating, greyed-out shapes that match the dimensions of the widgets (the donut chart, the table rows). This prevents layout shift and significantly improves perceived performance.

Prop Drilling vs. Context: Since the dashboard widgets are immediate children of the main Dashboard view, simple prop passing is fine here. You do not need to push this specific dashboard data into global state (like Redux) unless other pages need it. Keep the state local to the <Dashboard /> container and pass it down.

Strict Typing: Define strict prop structures for these "dumb" components. If a widget expects a completedTasks integer, enforce that constraint early so the UI doesn't crash if the backend returns a null value.

1.5. Backend API Specification
To support the UI layout shown in your reference image, your Node/Express backend needs a highly optimized endpoint. When deploying this to your VPS, ensuring this single aggregation endpoint is heavily optimized will keep your CPU usage stable and prevent the database from bottlenecking.

Endpoint: GET /api/v1/dashboard/overview
Access: Protected (Requires JWT Authentication)

Expected JSON Response Payload:

JSON
{
  "success": true,
  "data": {
    "invoicing": {
      "unbilledPackages": 16,
      "unbilledTasks": 109
    },
    "bestPerformers": [
      {
        "userId": "64a1b2c...",
        "name": "Kunal",
        "role": "Accountant",
        "totalAssigned": 3,
        "completed": 2,
        "completionPercentage": 67,
        "avatarUrl": "..."
      }
      // ... more users
    ],
    "attendanceOverview": [
      {
        "userId": "64a1b2d...",
        "name": "Janhvi Mathur",
        "role": "Accountant",
        "daysPresent": 6.5,
        "daysAbsent": 0,
        "attendancePercentage": 100
      }
      // ... more users
    ],
    "clientDistribution": {
      "totalNewClients": 43,
      "breakdown": {
        "soleProprietorship": 15,
        "privateLimited": 10,
        "individual": 8,
        "onePersonCompany": 5,
        "partnershipFirm": 3,
        "trust": 1,
        "ngo": 1
      }
    },
    "timeTracking": {
      "averageTimeSpent": "88:35",
      "period": "last 30 days"
    },
    "upcomingHolidays": []
  }
}
1.6. Database Schema Dependencies
To generate the JSON payload above via MongoDB aggregation pipelines, your application will rely on the following core Mongoose collections being well-structured:

Users Collection: Needs fields for role, avatar, and status.

Tasks Collection: The heaviest collection. Must include assignedUserId, clientId, status (Pending, Completed, etc.), timeLogged (in minutes), and isBilled (boolean). This collection must be heavily indexed on assignedUserId and status.

Clients Collection: Needs an entityType field (enum: 'Sole Proprietorship', 'Private Limited', etc.) and a createdAt timestamp to filter for "New" clients.

Attendances Collection: Needs userId, date, checkIn, and checkOut timestamps.

Holidays Collection: A simple collection storing date and eventName.

That completes the architectural blueprint for Module 1: Dashboard Overview.








Here is the detailed Requirements Engineering and Feature Mapping document for **Module 2: User Management**, based directly on the provided interface screenshots.

This module is arguably the most critical security layer of the application. It handles not just user creation, but the complex Role-Based Access Control (RBAC) and Scope-Based Access Control (SBAC) that dictates what data a user can interact with.

---

# Module 2: User Management & Role-Based Access Control (RBAC)

## 2.1. User Directory (List View)

**Description:** The centralized table where administrators can view, search, and manage all agency employees.

**UI Components & User Stories:**

* **Search Bar:** As an admin, I can search for a user by name, username, or email.
* **Data Table Columns:**
* **Photo:** Displays the user's uploaded avatar or a default placeholder silhouette.
* **Name:** The user's full name (clickable, routing to the user's edit/profile page).
* **Role:** The assigned permission level (e.g., Admin, Accountant).
* **Username:** The unique identifier used for login.
* **Mobile & Email:** Contact information.
* **Status:** A visual indicator (Active in green, Inactive in grey).


* **Action Button:** A primary "+ New" button to route to the user creation form.

**MERN Implementation Notes:**

* **Backend (Node/Express):** Create a `GET /api/v1/users` endpoint. Use Mongoose's `.populate('roleId', 'name')` to fetch the role name alongside the user data. Ensure you use `.select('-password')` so password hashes are never sent to the React client.
* **Frontend (React):** Implement a reusable `<DataTable/>` component. The search should be debounced to prevent API spamming.

---

## 2.2. User Creation & Profile Management

**Description:** The form interface used to onboard a new employee or edit an existing one.

**UI Components & User Stories:**

* **Photo Upload:** An interactive image upload area with an edit icon.
* **Required Fields (Marked with `*`):** Name, Username, Password, Confirm Password, Role.
* **Optional Fields:** Mobile, Email.
* **Role Selection:** A dropdown populating dynamically from the `Roles` collection (e.g., Account Executive, Accountant, Admin, Billing Department, Team Leader). Includes a helper link: "To create custom user roles go to Settings > User Roles".
* **Status Toggle:** "Is Active?" switch to grant or revoke system access without deleting the user's historical data.

**MERN Implementation Notes:**

* **Backend Uploads:** Use `multer` to handle the multipart form data for the photo upload. Upload the image to an AWS S3 bucket or Cloudinary, and save the resulting URL string to the MongoDB `photoUrl` field.
* **Security:** Passwords must be hashed using `bcryptjs` in a Mongoose `pre('save')` hook before hitting the database. The "Confirm Password" logic should be handled by React state validation before submission.

---

## 2.3. User Roles Overview

**Description:** A management screen displaying all custom-defined security roles within the agency.

**UI Components & User Stories:**

* **Search Bar:** Filter roles by name.
* **Data Table Columns:**
* **Name:** Role title (clickable to edit the permission matrix).
* **Assigned Users:** A visual cluster of avatars representing the employees holding this role. If more than 3-4 users share the role, an overflow badge (e.g., "+1") is displayed.


* **Action Button:** "+ New" button to define a new custom role.

**MERN Implementation Notes:**

* **MongoDB Aggregation:** To get the "Assigned Users" avatars efficiently, do not fetch all users. Use an aggregation pipeline on the `Roles` collection with a `$lookup` to the `Users` collection. Use `$slice` to return only the first 3 or 4 avatar URLs, and `$size` to return the total count to calculate the overflow badge number.

---

## 2.4. Granular Permission Matrix (RBAC & SBAC Engine)

**Description:** The core security configuration form where specific access rights are defined for a custom role.

**UI Components & User Stories:**

* **Role Name:** Text input for the role's title (e.g., "Junior Accountant").
* **Module Cards:** Permissions are visually grouped into logical business areas:
* **Client:** Create, Edit, View, Delete, View ledger, Manage Client Packages, View Client Packages.
* **Task:** Create, Edit, View, Delete, Verify tasks, Assign tasks to other users, Add or Update Time Log Manually, Delete Note.
* **Invoice/Receipt/Quotation:** Create, Edit, View, Delete.
* **Expense:** Create, Edit, View, Delete.
* **Doc. In-Out Reg / DSC:** Create, Edit, View, Delete.
* **Attendance:** Mark attendance, Mark past/future attendance.
* **To-Do:** Assign to-do to other users.
* **Settings:** Manage Masters.


* **Scope Dropdowns ("Everything"):** Crucially, many checkboxes feature an adjacent dropdown. This implies Scope-Based Access Control (SBAC). For example, an employee might have permission to "View Tasks", but the scope dictates whether they can view "Everything" (the whole agency's tasks) or "Assigned Only" (only tasks explicitly assigned to them).

**MERN Implementation Notes (Crucial Architecture):**

* **Database Schema:** Your `Role` Mongoose schema needs to handle both the boolean permission and the scope.
```javascript
const roleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  permissions: {
    task: {
      view: { allowed: Boolean, scope: { type: String, enum: ['everything', 'assigned_only', 'team_only'] } },
      create: { allowed: Boolean, scope: String },
      delete: { allowed: Boolean, scope: String },
      // ...
    },
    client: {
      // ...
    }
  }
});

```



```
*   **Backend Middleware Strategy:** You need a highly robust `authorize()` middleware in Express.
    *   When a user requests `GET /api/v1/tasks`, the middleware checks `req.user.role.permissions.task.view`.
    *   If `allowed` is false, return `403 Forbidden`.
    *   If `allowed` is true, check the `scope`. If the scope is "assigned_only", the middleware must inject a query parameter into the request: `req.query.assignedUserId = req.user._id`. This ensures the controller only fetches tasks belonging to that user.
*   **Frontend Checkbox State:** In React, this form will require a deeply nested state object. Use a library like `react-hook-form` or standard state with immutable updates to manage the checkbox arrays and dropdown scopes without causing excessive re-renders.

---

### 2.4. Granular Permission Matrix (RBAC & SBAC Engine) - *Continued*

**MERN Implementation Notes (Crucial Architecture - Continued):**

* **Frontend Consumption (React Context / Custom Hooks):** Once the user logs in, their full permission matrix should be fetched and stored in a global state (e.g., Redux Toolkit, Zustand, or React Context). You should create a custom hook, like `usePermissions()`, to conditionally render UI elements across the entire dashboard.
* *Example:* If `req.user.role.permissions.invoice.create.allowed` is `false`, the "+ New" button on the Invoice list page should not even render in the DOM.
* *Example:* `{!hasPermission('invoice', 'create') ? null : <button>+ New Invoice</button>}`


* **Handling the "Scope" in React:** If a user has "View Tasks" set to `assigned_only`, the React frontend must not display a global filter dropdown for "All Agency Tasks". The UI must adapt to their scope, hard-locking their view to their own task queue.

---

## 2.5. Business Logic & Edge Cases for User Management

As a lead developer, you must anticipate how user management impacts the rest of the application's historical data. You cannot simply delete users or change roles without planning for the consequences.

**1. The `isActive` Toggle (Soft Deletes vs. Hard Deletes)**

* **The Problem:** If an employee leaves the agency and you delete their MongoDB document (`db.users.deleteOne`), every single Task, Invoice, or Receipt that referenced their `_id` will break or show "Unknown User".
* **The MERN Solution:** Never hard-delete users. The "Is Active?" toggle in the UI (seen in `image_3d3d52.png`) maps to an `isActive: { type: Boolean, default: true }` field in Mongoose.
* **Backend Impact:**
* When fetching users to populate dropdowns for *assigning* new work, add `.find({ isActive: true })`.
* When displaying historical task data, the inactive user's name will still correctly populate via `.populate()`, preserving the agency's audit trail.
* If `isActive` is false, your authentication middleware must immediately reject their JWT, logging them out of the system.



**2. The "Super Admin" Fallback**

* **The Problem:** An admin accidentally modifies the "Admin" role matrix and removes their own permission to "Manage Masters" or "Edit Users", effectively locking everyone out of the system settings.
* **The MERN Solution:** Hardcode a "Super Admin" bypass in your backend `authorize()` middleware. If `req.user.role.name === 'Super Admin'`, the middleware should instantly return `next()` and bypass all matrix checks. This role should be immutable and hidden from the "User Roles" deletion UI.

**3. Cascading Role Updates**

* **The Problem:** You update the "Accountant" role to remove "Delete Invoice" permissions. Do the existing users with that role instantly lose permission?
* **The MERN Solution:** Yes, if designed correctly. Because you are linking the `User` schema to the `Role` schema via an `ObjectId` reference, changes to the central role matrix apply instantly to all assigned users on their next API request. You do not need to update individual user documents.

**4. Concurrent Sessions & JWT Invalidation**

* If an admin clicks the "Is Active?" toggle to disable a user, that user might still have a valid JWT stored in their browser's local storage for the next 24 hours.
* **Security measure:** Implement a token versioning system or a Redis blacklist. When a user's role or status changes, increment a `tokenVersion` integer on their Mongoose document. During JWT verification, if the token's payload version doesn't match the database version, reject the request and force a re-login.

---
3.2. Task Creation Engine (Advanced Lead Developer Notes)
1. Frontend Optimization: Handling Massive Dropdowns

The Problem: When creating a task manually, the user must select a "Client". If the agency has 5,000 clients, rendering a standard <select> dropdown with 5,000 <option> tags will cause severe DOM lag and crash the React application.

The React Solution: Implement Async Select with Virtualization. Use a library like react-select paired with react-window.

Instead of fetching all clients on load, the dropdown should trigger a debounced API call as the user types (e.g., GET /api/v1/clients?search=AutoPrime).

Virtualization ensures only the 10-15 clients currently visible in the dropdown scroll-box are actually rendered in the DOM.

2. Backend Idempotency: Cron Job Safety (Crucial)

The Problem: You set up a node-cron job to auto-generate monthly GST tasks at midnight. One night, the server reboots unexpectedly at 12:01 AM, or you scale to two backend Node.js instances (horizontal scaling). The cron job runs twice, creating duplicate tasks for every client.

The MERN Solution: Your automated task generation function must be idempotent (safe to run multiple times).

Before inserting the automated tasks, the script must query the Tasks collection: "Does a task with serviceId = X, clientId = Y, and period = 'March 2026' already exist?"

Alternatively, use BullMQ with a Redis instance instead of node-cron. BullMQ handles distributed locking automatically, ensuring a scheduled job is only processed by one worker, even if you have 5 backend servers running.

3. Period vs. Due Date Data Integrity

The Problem: A "Period" (e.g., "January 2026") and a "Due Date" (e.g., "Feb 15, 2026") are two different concepts in agency workflows.

The Database Solution: In your Mongoose schema, do not rely solely on the dueDate to figure out what month the task belongs to. Store period explicitly.

JavaScript
period: { 
  month: { type: Number, min: 1, max: 12 }, 
  year: { type: Number },
  label: { type: String } // e.g., "Q1 2026" or "Jan 2026"
}
This makes generating the "Task Reports" and filtering by specific financial quarters significantly faster via MongoDB queries.








Here is the detailed Requirements Engineering and Feature Mapping document for **Module 4: Service Management**, based directly on the interface screenshots you provided.

This module acts as the "Blueprint Engine" of the application. The configurations set here dictate how the automated task generation, billing, and workflows operate across the entire system.

---

# Module 4: Service Management (The Blueprint Engine)

## 4.1. Services Directory (List View)

**Description:** The master catalog of all standardized services offered by the agency.

**UI Components & User Stories:**

* **Search Bar:** Filter services by name.
* **Data Table Columns:**
* **Service Name:** Clickable link routing to the configuration tabs.
* **Recurring:** Frequency indicator (e.g., Monthly, Half-Yearly, Quarterly).
* **Assigned Clients:** A count badge showing how many clients are currently subscribed to this service.
* **Status:** Visual indicator of active/inactive state.


* **Action Buttons:** * **Import:** Bulk upload services via CSV/Excel.
* **+ New:** Manually create a new service blueprint.



**MERN Implementation Notes:**

* **Database Schema (`Service`):** Keep this collection as lightweight as possible for the list view. Use Mongoose `$count` aggregations to dynamically calculate the `Assigned Clients` metric rather than keeping a hardcoded integer that could fall out of sync.

---

## 4.2. Service Configuration: Settings (Core Logic)

**Description:** The primary configuration form defining how and when a service translates into an actionable task.

**UI Components & User Stories:**

* **Basic Details & Toggles:**
* Service Name (String).
* **Is Enabled?** (Boolean): Soft disable a service without deleting it.
* **Is Checklist Completion Required?** (Boolean): Prevents users from marking a generated task "Complete" if the checklist isn't finished.
* **Is Recurring?** (Boolean): Triggers the automation engine settings below.


* **Automation & Recurrence Settings (Crucial):**
* **Frequency:** Dropdown (Monthly, Quarterly, Yearly, etc.).
* **Creation Date & Due Date:** Integer selectors (e.g., 1st to 20th of every month).
* **Period Logic:** Radio buttons determining the reporting period context:
* *Create Tasks for Recently Completed Period:* (e.g., A task created on Feb 1st is for the "Jan 2025" period).
* *Create Tasks for Currently Running Period:* (e.g., A task created on Feb 1st is for the "Feb 2025" period).




* **Assignment Logic:**
* Toggle to auto-assign tasks to the "Default User" of the respective client, OR
* Select specific users from a dropdown to force-assign all tasks for this service to them.


* **Billing Settings:**
* SAC Code and GST % dropdown.
* Default Billing Rate (Excl. of Tax).
* Toggle to mark tasks as billable by default.


* **API & Integrations:**
* **GST API Config:** Toggle to auto-check return filing status from the GST Server based on a selected "Return Type" (e.g., GSTR3B).
* **Document Collection:** Toggle to auto-create a document request on the client portal with a customized default message upon task creation.



**MERN Implementation Notes:**

* **Backend Cron Logic:** The Period Logic ("Recently Completed" vs "Currently Running") will dictate the math in your Node.js cron scheduler. If "Recently Completed" is selected, your backend must subtract 1 month (or quarter/year) from the current `Date()` object when generating the string for the Task's `period` field.

---

## 4.3. Service Configuration: Checklist

**Description:** Standard Operating Procedure (SOP) steps that must be followed for quality control.

**UI Components & User Stories:**

* **Dynamic List:** A vertical list of input fields where the manager can type required steps (e.g., "Generate Challan").
* **Actions:** Drag-and-drop to reorder (implied by the `=` icon), delete step, and "+ Add Step".

**MERN Implementation Notes:**

* **Frontend (React):** Use a library like `react-beautiful-dnd` or `@hello-pangea/dnd` for the drag-and-drop ordering. Use React's `useFieldArray` (if using `react-hook-form`) to manage the dynamic array of inputs efficiently.
* **Database Schema:** Store this as an array of strings within the `Service` document: `checklist: [{ stepName: String, orderIndex: Number }]`.

---

## 4.4. Service Configuration: Subtasks

**Description:** Defines granular, assignable sub-units of work within the main task.

**UI Components & User Stories:**

* **Enable Workflow Toggle:** If enabled, subtasks likely trigger sequentially (Subtask B only activates when Subtask A is completed).
* **Subtask Fields:** Title, Description, relative Due Date, and specific User assignment overrides.
* **Actions:** "+ Add Subtask" and delete.

**MERN Implementation Notes:**

* **Inheritance:** When the backend cron job creates a `Task` document from this `Service` blueprint, it must iterate through this subtask array and either embed them into the new `Task` document or create separate `Subtask` documents tied to the `taskId`.

---

## 4.5. Service Configuration: Custom Fields

**Description:** Allows the agency to capture specific, non-standard data on the generated tasks.

**UI Components & User Stories:**

* **Dynamic Data Types:** Define custom field names (e.g., "Acknowledgment no.") and assign a Field Type (Input text, Select dropdown).
* **Options:** If "Select" is chosen, define the comma-separated options (e.g., "01, 02, 03").

**MERN Implementation Notes:**

* **Strict Distinction (Architecture):** The `Service` document only stores the *schema* of the custom fields.
* *Service Schema:* `customFieldsDef: [{ label: String, type: Enum, options: [String] }]`
* *Task Schema:* When a task is rendered, the frontend builds inputs based on that definition. The actual typed values are saved on the `Task` document as key-value pairs: `customFieldValues: { "Acknowledgment no.": "ACK9938" }`.



---

## 4.6. Service Configuration: Clients (Assignment & Overrides)

**Description:** Manages which clients are subscribed to this service and allows for pricing/assignment exceptions.

**UI Components & User Stories:**

* **Search & Selection:** Search bar and checkboxes to manage the assigned client list.
* **Data Table Columns:**
* Clients Name, File No., Package (if bundled).
* **Custom Price:** Displays if a specific client is charged a different rate than the "Default Billing Rate" defined in Settings.
* **Custom Users:** Displays avatars if a specific client has a unique team assigned to this service, overriding the default settings.


* **Action Buttons:** "+ Assign to Clients" modal and "Bulk Action" updates.

**MERN Implementation Notes:**

* **Many-to-Many Relationship Model:** This is the trickiest database architecture in this module. Because a Client can have many Services, and a Service has many Clients, AND you need to store *override data* (Custom Price, Custom User) for that specific relationship, you should use a mapping schema or embed the overrides cleanly.
* **Recommended Mongoose Approach:** Embed an array of subscribed services inside the `Client` document.


When viewing this "Clients" tab inside the Service module, your backend runs an aggregation: "Find all Clients where `subscribedServices.serviceId` matches this Service, and return their custom price/user overrides."

Module 4: Advanced Lead Developer Notes
1. Frontend State Management: The "Multi-Tab Form" Problem

The Problem: The Service configuration uses tabs (Settings, Checklist, Subtasks, Custom Fields, Clients). A common mistake mid-level React developers make is treating each tab as a separate API call (e.g., clicking "Save" on the Checklist tab fires a PUT, clicking "Save" on Subtasks fires another PUT). This leads to fragmented data, race conditions, and an awful user experience if they lose internet connection halfway through.

The React Solution: Treat the entire Service configuration as a single, massive React state object. Use a library like react-hook-form paired with a state management tool (or just standard React Context if localized).

The tabs should simply render different "views" of this single state object.

There should be one master "Save" button that sends the entire payload (Settings, Checklist arrays, Subtask arrays) to a single PUT /api/v1/services/:id endpoint.

2. Backend Optimization: Cron Job Indexing

The Problem: You have a cron job running every night at midnight to check the Services collection for automated task generation. If you have 500 active services, querying the whole collection every night will eventually slow down your VPS.

The MERN Solution: Your MongoDB queries inside the cron worker must be highly optimized.

Create a Compound Index in Mongoose on the fields that matter for automation: { isEnabled: 1, isRecurring: 1, 'frequency.dueDate': 1 }.

Your cron job should only query services where isEnabled === true and isRecurring === true.

3. The Cascade Effect of "Is Enabled" (Soft Deletes)

The Problem: An admin toggles "Is Enabled" to false for the "GST-3B (M)" service because they no longer offer it. What happens to the thousands of historical tasks already generated for clients under this service?

The MERN Solution: This goes back to soft deletes.

Disabling a service should immediately halt the cron job from generating new tasks for it.

However, it must not delete or hide historical tasks. In your Tasks collection, because you referenced the serviceId, the React frontend will still populate the name "GST-3B (M)" for tasks completed in 2024, preserving the financial and operational audit trail.



The transition from standalone services to bundled packages is where the billing architecture of this application gets interesting. While Module 4 handles the *operational* blueprints (how work is done), this module handles the *commercial* wrappers (how work is sold and billed).

Here is the architectural breakdown and MERN implementation strategy for **Module 5: Package Management**, driven directly by the interface design.

---

## Module 5: Package Management (The Commercial Wrapper)

### 5.1. Package Configuration Form

**Description:** The interface where an agency administrator bundles multiple operational services together under a single, unified pricing and billing structure.

**UI Components & User Stories:**

* **Basic Details Panel (The Billing Wrapper):**
* **Name:** The commercial title of the bundle (e.g., "Complete Compliance Package").
* **Frequency:** Dropdown defining the billing cycle (e.g., Monthly, Yearly). Note that this is the *billing* frequency, which might differ from the execution frequency of the underlying services.
* **Default Billing Amount:** The consolidated price for the bundle.
* **Taxation Settings:** SAC Code and GST % dropdown to ensure the invoice calculates tax correctly at the package level.


* **Services Panel (The Operational Core):**
* A dynamic checklist of all active services pulled from the `Services` collection (e.g., Advance Tax, Audit Yearly, Client Visit, CMP-08).
* As an admin, I can check multiple services to group them into this specific package.



**MERN Implementation Notes:**

* **Database Schema (`Package`):**
This collection sits as a parent to the `Services`. It acts heavily as a commercial entity rather than an execution one.


* **Frontend Checkbox Optimization:** The checklist on the right side of the screen must fetch `GET /api/v1/services`. Instead of saving true/false for every single service in the agency, map the checked items into an array of ObjectIds (`["60b9...", "60ba..."]`) before sending the `POST /api/v1/packages` payload.

---

### 5.2. MERN Architectural Strategy: Resolving the "Frequency" Conflict

As a lead developer, this interface introduces a critical architectural challenge you must solve immediately: **The Frequency Conflict**.

In Module 4, we established that a `Service` has a frequency (e.g., "Audit Yearly" happens once a year). In this module, the `Package` also has a frequency (e.g., a client pays "Monthly" for the package).

You must strictly separate the **Billing Cron Job** from the **Task Execution Cron Job**.

**1. Task Execution (The Operational Engine)**

* When a client is assigned a Package, your backend should "unpack" that package and subscribe the client to the underlying Services.
* The automated task generator (built in Module 3/4) should completely ignore the Package. It should strictly look at the `Service` blueprints to generate the work queue. (e.g., Even if the client pays monthly for the package, the "Audit Yearly" task only generates once a year).

**2. Invoicing Automation (The Financial Engine)**

* When it comes to billing, the system ignores the individual task execution costs and instead looks at the `Package` frequency.
* You will need a separate financial cron job that runs daily. It checks the `Packages` assigned to clients and generates an Invoice line item based on the Package's `frequency` and `defaultBillingAmount`.

### 5.3. Handling Edge Cases & Deletions

* **Modifying a Package:** If an admin unchecks "Client Visit" from an existing package and clicks save, what happens to clients currently subscribed to it?
* *Solution:* Prompt the user with a confirmation modal in React: *"Update existing client subscriptions to match this new package structure?"* If yes, the Node backend must iterate through the `Clients` collection and remove the "Client Visit" service reference from their subscribed list.


* **Soft Deletes:** Just like users and services, packages cannot be hard-deleted if they have been attached to historical invoices. Implement an `isActive` toggle. If a package is discontinued, it stops appearing in the "Assign to Client" dropdowns, but old invoices referencing it remain intact.

---

Before we move on to **Module 6: Client Management**, how do you want to handle the display logic on the final invoice? When the system auto-generates a bill for this package, should the PDF display just the single "Package Name" on one line, or do you need it to dynamically itemize all the underlying services so the client sees exactly what is inside the bundle?

















This is exactly why we broke this down. Looking at these new screenshots, the `Client` module isn't just a basic CRUD (Create, Read, Update, Delete) directory—it is a massive **Client Dashboard (A 360-Degree Hub)** that pulls data from almost every other collection in your database.

If you build the React components or the Express routes for this dashboard inefficiently, the app will grind to a halt when you load a client with 3 years of history.

Here is the detailed architectural breakdown for the **Client Dashboard** phase of Module 6.

---

# Module 6: Client Management (Part 2 - The Client Dashboard)

## 6.5. Client Dashboard: Overview & Toggles (`Details` Tab)

**Description:** The primary landing page when an admin clicks into a specific client. It acts as a real-time health check for that client's account.

**UI Components & User Stories:**

* **Data Summary Widgets:** Displays immediate counts for Pending Tasks, Hold Tasks, In-Progress Tasks, Completed Tasks, Unbilled Tasks, and the total Ledger Balance (e.g., ₹29,760.00).
* **Client Meta-Data:** Left sidebar showing the avatar, File No., assigned Group, assigned Users, and applied Tags. Main panel shows contact details, PAN/GSTIN, and Custom Fields (Bank Details, TAN, DIN).
* **Automation Toggles:**
* **Create invoice automatically every month:** Triggers the billing cron job for this specific client.
* **Allow Notifications:** Master switch to mute/unmute automated SMS/Emails.
* **Allow Login:** Master switch to block or grant access to the client-facing portal.



**MERN Implementation Notes:**

* **Backend Aggregation (Critical):** Do *not* fetch all tasks and all invoices to the React frontend just to count them. Create a highly optimized endpoint `GET /api/v1/clients/:id/summary`. Use a MongoDB `$facet` aggregation pipeline to run multiple independent queries (count pending tasks, sum the ledger balance) in a single database hit.

---

## 6.6. Operational Tabs (`Services`, `Packages`, & `Tasks`)

**Description:** The execution view scoped strictly to this specific client.

**UI Components & User Stories:**

* **Services Tab:** Splits into "Availed Services" (individual blueprints) and "Recurring Services" (with next generation dates). It also lists active "Client Packages".
* **Tasks Tab:** A dedicated task table filtered automatically to this client. Includes date range, service, status, and task type dropdown filters.

**MERN Implementation Notes:**

* **Frontend Component Reusability:** Do not build a new Task Table for this tab. Reuse the exact same `<DataTable />` component from Module 3 (Task Management), but pass a locked `clientId={client._id}` prop so the component knows to automatically append `?clientId=123` to its API fetch requests.

---

## 6.7. Asset & File Management (`Documents` & `Docs In-Out`)

**Description:** Handling both digital cloud storage and physical office tracking.

**UI Components & User Stories:**

* **Documents Tab:** Two distinct dropzones. "Task Doc. Directory" (files generated by staff during task execution) and "Client Documents" (permanent files like PAN cards or Incorporation Certificates).
* **Docs. In-Out Register:** A digital logbook for physical items (e.g., "Received Passbook on 24-03-2023, Return Date: 08-04-2023").

**MERN Implementation Notes:**

* **VPS & Storage Architecture:** Since you are deploying and managing this backend on your own VPS, **do not** configure `multer` to save these heavy PDF and ZIP files directly to your server's local `/uploads` folder. Your VPS disk space will fill up fast, causing the database to crash. Instead, integrate an S3-compatible object storage service (like AWS S3 or DigitalOcean Spaces). Your backend should upload the file there, and only save the resulting string URL in MongoDB.

---

## 6.8. The Financial Hub (`Ledger` & `Quotations`)

**Description:** The client's financial statement and transaction history.

**UI Components & User Stories:**

* **Ledger Tab:** A chronological table of Debits (Invoices) and Credits (Receipts/Payments).
* **Running Balance:** The table calculates the running balance row-by-row.
* **Show Invoice Items:** A toggle to expand an invoice row to see the exact line items inside it without leaving the page.

**MERN Implementation Notes:**

* **Ledger Math:** Calculating a running balance across paginated data in React is notoriously difficult (because Page 2 needs the final balance of Page 1 to start its math). The Node.js backend must calculate the running balance during the database query and send the pre-calculated `balance` integer for each row in the JSON response.

---

## 6.9. Security Vault (`Passwords` Tab)

**Description:** A secure vault for agency staff to store and retrieve the client's login credentials for external government or tax portals (e.g., GST, ITR portals).

**UI Components & User Stories:**

* **Password Table:** Lists the Login Portal name, Username, and masked password (`********`).
* **Actions:** Copy to clipboard icon, and an "eye" icon to reveal the plain text password.
* **Bulk Import:** Ability to upload an Excel sheet of passwords.

**MERN Implementation Notes (High Security Risk):**

* **Encryption vs. Hashing:** This is a major technical divergence from Module 2. In Module 2, you used `bcrypt` to hash employee passwords because you *never* need to read them again. Here, the agency staff *must* be able to view the plain text password to log into the GST portal. You cannot use bcrypt.
* **Symmetric Encryption:** You must use two-way encryption. Use Node.js's native `crypto` module.
* Use `aes-256-cbc` algorithm.
* Store a massive, secure `ENCRYPTION_KEY` inside your `.env` file on the VPS.
* When saving the password, encrypt it using the key. Save the encrypted string and the `iv` (Initialization Vector) in the database.
* When the frontend clicks the "eye" icon, make an API call to decrypt it and return the plain text string. If your `.env` key is ever lost, these passwords will be permanently unreadable.



---

This completes the architecture for the Client Management module. It is the heaviest module in the system.

Which technical hurdle here feels like the highest priority to map out next? Do you want to dive into the two-way AES encryption logic for the Password Vault, or should we move on to **Module 7: Billing & Invoices**?

6.10. Reimbursable Expenses (Expenses Tab)
Description: A dedicated space to track out-of-pocket costs the agency incurred while executing work for the client (e.g., paying government fees or travel costs), which need to be billed back to the client.

UI Components & User Stories:

Expense Ledger (List View): A table showing Date, Category (e.g., Employee OPE's, Stationary, Tax paid, Legal Exp.), Mode of payment, Notes, Amount, and Billing Status (e.g., a green "Billed" badge).

Filtration: Filter the ledger by Date Range, a Search string, or specific Category.

New Expense Form:

Date: When the expense occurred.

Category Dropdown: Select from existing categories, with an inline "+ Add New" option to dynamically create a new category master record on the fly.

Client Context: Pre-filled with the current client (Auto Prime).

Amount & Notes: The financial value and context.

Upload: A dropzone to attach the physical receipt or voucher (Max 5MB, supporting images and PDFs).

MERN Implementation Notes:

The "Unbilled" State: This is the most crucial part of the Expense architecture. When an expense is created, its default state in MongoDB should be isBilled: false.

Bridging to Module 7 (Invoicing): When a user goes to generate a new Invoice for this client, your Node.js backend should automatically query Expense.find({ clientId: X, isBilled: false }). The UI should prompt the user: "You have ₹1,489 in unbilled expenses for this client. Add them to this invoice?" If added, the expense document updates to isBilled: true and links to the invoiceId.

6.11. Digital Signature Certificate (DSC) Management
Description: In India, agency work often requires the use of a client's physical USB token containing their Digital Signature Certificate (DSC) to file taxes on government portals. These certificates expire and must be renewed, making tracking them a high-priority operational task.

UI Components & User Stories:

DSC Directory (List View): A table tracking Client, Class (of the DSC), Issue Date, Expiry Date, Notes, and "Created By".

Filtration: Highly specific date filters for "Issue Date" and "Expiry Date" (e.g., find all DSCs expiring next month).

Actions: Import/Export capabilities and a "+ New" button to log a received DSC token.

MERN Implementation Notes:

Automated Expiry Alerts (Cron Job): The real value of this feature isn't just listing the dates; it's the automation. You need a daily cron job that scans the DSCs collection.

Query: Find all DSCs where expiryDate is exactly 30 days, 15 days, or 7 days from today.

Action: Automatically generate an internal Task (assigned to the respective account manager) titled "Renew DSC for [Client Name]" and send an automated SMS/Email reminder to the client.

Final Database Review for Module 6
Before we close out Client Management, let's review how the Client schema acts as the ultimate reference point.

When you query a single client dashboard (GET /api/v1/clients/:id), the volume of referenced data is massive. To avoid slow load times on your MERN app, structure your React Router to load the tabs lazily.

Don't do this: Fetch the client, all their tasks, all their invoices, all their documents, and all their expenses on the initial page load.

Do this: When the page loads, only fetch the summary API (for the top widgets) and the basicDetails API. When the user clicks the "Expenses" tab, then trigger the API call to GET /api/v1/expenses?clientId=123.

This keeps the dashboard lightning fast, regardless of how much history the client has.

---

# Module 7: Finance & Ledger Management

## 7.1. Invoicing (The Revenue Engine)

**Description:** The core billing interface where unbilled operational work (Tasks, Retainers, Expenses) translates into a formal tax document.

**UI Components & User Stories:**

* **Billing Entity Dropdown:** Allows the user to select which company profile is issuing the invoice (e.g., "Primary"). This is crucial as an agency scales and might operate under different legal names or regional tax registrations.
* **Invoice Meta-Data:** Date, auto-generated Invoice No., Payment Terms (e.g., Net 15, Due on Receipt), and Due Date.
* **Dynamic Invoice Items:** A central workspace to pull in billable items. The UI shows color-coded toggles for fetching unbilled `Tasks`, `Expenses`, or `Retainers`.
* **Financial Math:** Automatic calculation of Subtotal, applied Discounts, Round Offs, and the final Total Amount.

**MERN Implementation Notes:**

* **The "Fetch Unbilled" Logic (Backend):** When a client is selected, your React frontend should hit an endpoint like `GET /api/v1/billing/unbilled?clientId=123`. The Node controller must query the `Tasks` and `Expenses` collections for documents where `clientId` matches AND `isBilled: false`.
* **Database Schema (`Invoice`):**
```javascript
const invoiceSchema = new mongoose.Schema({
  billingEntityId: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingEntity' },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  invoiceNo: { type: String, unique: true },
  items: [{
      referenceType: { type: String, enum: ['Task', 'Expense', 'Manual'] },
      referenceId: { type: mongoose.Schema.Types.ObjectId }, // Links back to the original task/expense
      particulars: String,
      amount: Number,
      discount: Number,
      total: Number
  }],
  status: { type: String, enum: ['Draft', 'Unpaid', 'Partially Paid', 'Paid'], default: 'Unpaid' },
  totals: { subtotal: Number, discount: Number, roundOff: Number, grandTotal: Number, amountDue: Number }
}, { timestamps: true });

```


* **State Management (Crucial):** Upon saving the invoice, a Mongoose `post('save')` hook must fire to update all referenced Tasks and Expenses to `isBilled: true`.

---

## 7.2. Receipts & Settlements (Cash Flow)

**Description:** Logging incoming payments and reconciling them against outstanding invoices to keep the client's ledger accurate.

**UI Components & User Stories:**

* **Receipt Meta-Data:** Billing Entity, Date, auto-generated Receipt No., Payment Mode (Cash, Bank Transfer, UPI).
* **Financial Inputs:** Received Amount, TDS Amount (Tax Deducted at Source), and Discount.
* **Invoice Settlement Interface:** A table listing all unpaid invoices for the selected client. The user can click "Auto Apply" to cascade the received amount down the oldest invoices, or manually type settlement amounts per invoice row.

**MERN Implementation Notes (High Risk Area):**

* **MongoDB Transactions (ACID Compliance):** This is the most complex backend operation in the app. If a client pays ₹10,000 to settle three different invoices, your backend must update the `Receipt` document AND update the `amountDue` and `status` of three separate `Invoice` documents.
* *Failure Scenario:* If the server crashes after updating Invoice 1 but before Invoice 3, your ledger is corrupted.
* *Solution:* You **must** use MongoDB Sessions and Transactions here (`const session = await mongoose.startSession(); session.startTransaction();`). If any update fails, you abort the transaction so the database rolls back to its exact previous state.



---

## 7.3. Credit Notes (Financial Adjustments)

**Description:** The legally compliant way to reduce an invoice's total after it has been finalized and sent to the client (e.g., granting a partial refund or correcting an overcharge).

**UI Components & User Stories:**

* **Invoice Linkage:** A dropdown to select the specific `Invoice No.` this credit note applies to.
* **Adjustment Items:** Line items specifying exactly what is being credited back, calculating a Subtotal and Total Amount.

**MERN Implementation Notes:**

* **Immutability Rule:** In standard accounting, once an invoice is marked "Sent" or "Paid", you generally do not allow users to simply edit the database document to lower the price. You issue a Credit Note.
* When a `CreditNote` is saved, it acts mathematically like a `Receipt`. It credits the client's ledger and reduces the `amountDue` of the linked `Invoice`.

---

## 7.4. Quotations (Pre-Sales)

**Description:** Generating estimates for prospective or existing clients before work begins.

**UI Components & User Stories:**

* **Quote Builder:** Very similar to the manual invoice builder. Includes Billing Entity, Client, Date, Quotation No., Items (Services), and a large text area for Terms & Conditions.
* **List View:** Tracks the status of the quotes (e.g., Draft, Sent, Accepted, Rejected).

**MERN Implementation Notes:**

* **Schema Isolation:** The `Quotation` schema should be entirely separate from the financial ledger. Creating or deleting a quote should have absolute zero impact on a client's Ledger Balance or Revenue reports.
* **Conversion Flow:** Add a utility button in the React UI for an "Accepted" quote that says "Convert to Invoice". This should seamlessly pass the quotation's line items into the New Invoice React state, saving the user from double-data entry.

---

## 7.5. Expenses (Revisited for Context)

**Description:** Logging out-of-pocket costs.

**UI Components & User Stories:**

* **Expense Entry:** Client, Category, Amount, Payment Mode, Notes, and a file upload dropzone for the physical receipt.

**MERN Implementation Notes:**

* As detailed in Module 6, the critical MERN connection here is the `isBilled` flag. If an expense is tied to a `clientId`, it sits in a pending state until it is pulled into the "Invoice Items" array in Sub-module 7.1.

---


# Module 8: Attendance Management (Internal Operations)

## 8.1. Daily Attendance Tracker (The Operations Desk)

**Description:** A day-by-day view allowing authorized personnel to monitor who is currently in the office, who is on leave, and to process manual time entries.

**UI Components & User Stories:**

* **Date Navigator:** A calendar input (defaulting to today) with quick "Next/Previous Day" arrow toggles.
* **Status Summary Widgets:** Dynamic counter cards displaying real-time totals for: Present, Half Day, Overtime, Absent, Leave, and Paid Leave.
* **Employee Roster (Data Table):**
* Lists all active employees (Avatar, Name).
* Displays their logged `Check In` and `Check Out` times. If no data exists, it shows `-- | --`.


* **Actions:**
* **Mark Attendance:** A button per row to open a modal and manually input a user's status and timestamps.
* **Bulk Attendance:** A master button to apply a single status (e.g., "Holiday" or "Absent") to multiple selected users simultaneously via checkboxes.



**MERN Implementation Notes:**

* **The "Left Join" API Challenge:** When the frontend requests `GET /api/v1/attendance/daily?date=2026-06-11`, you cannot simply query the `Attendances` collection. If a user hasn't checked in yet, they won't have a document for that date, but they *must* still appear in the React table with blank times.
* **Backend Solution:** Your Node controller must first query the `Users` collection to get all `isActive: true` employees. Then, perform a MongoDB `$lookup` (aggregation) to fetch any matching attendance records for that specific date, merging them into the user objects before sending the JSON response.



---

## 8.2. Monthly Attendance Grid (The HR View)

**Description:** A macro-level matrix used for calculating monthly payroll and tracking chronic absenteeism.

**UI Components & User Stories:**

* **Filtration:** Filter by a specific User (dropdown) and a specific Month & Year.
* **The Matrix Grid:**
* Y-Axis: Employee Names.
* X-Axis: Days of the month (01 to 28/30/31).
* **Visual Indicators:** Weekends (e.g., Sundays) are highlighted differently (e.g., red text/grey background) based on the "Weekend Days" configured in the Master Settings.


* **Interactivity:** Clicking an empty cell should ideally pop open the "Mark Attendance" modal for that specific user and date.

**MERN Implementation Notes:**

* **Frontend Performance (React):** Rendering a 50-user by 31-day grid creates 1,550 DOM nodes immediately. Avoid using heavy, nested components for the grid cells. Use raw HTML `<table>` elements with CSS Grid, or implement virtualization (`react-window`) if the agency scales past 100 employees to prevent browser lag.
* **Backend Aggregation:** `GET /api/v1/attendance/monthly?month=06&year=2026`. The backend should fetch all attendance documents within that date range and group them by `userId` to send a clean, easily mappable object to React.

---

## 8.3. Workflows & Role-Based Access (Admin vs. Self)

**Description:** Handling how data actually enters the system.

**User Stories & Logic:**

* 
**Admin/Manager Override:** Users with "Everything" access in their Role Matrix can use the views above to mark attendance manually for any employee.


* **Self-Service Mode:** If a user’s role is restricted to "Self Only", they cannot use the Bulk Attendance or edit other users. Instead, they rely on a live timing widget (Check In / Check Out button) directly on their main Dashboard.



**MERN Implementation Notes:**

* **Security Middleware:** Your Express routes for `POST /api/v1/attendance` must check the JWT. If the user only has "Self" permission, and the `req.body.userId` does not match `req.user._id`, the server must instantly reject it with a `403 Forbidden`.
* **Time Zone Normalization (Critical):** Always save the `checkIn` and `checkOut` times to MongoDB in strict **UTC format**. Convert it to IST (or the agency's local timezone) only on the React frontend using a library like `date-fns` or `dayjs`. If you save local times directly to the database, calculating "Overtime" hours reliably becomes a nightmare.

---

## 8.4. Database Schema

To support both the daily roster and the monthly grid efficiently, the schema should track entries per user, per day.

```javascript
const attendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: String, required: true }, // Store as YYYY-MM-DD for fast exact-match querying
  status: { 
    type: String, 
    enum: ['Present', 'Absent', 'Half Day', 'Leave', 'Paid Leave'],
    required: true 
  },
  checkIn: { type: Date }, // UTC Timestamp
  checkOut: { type: Date }, // UTC Timestamp
  overtimeMinutes: { type: Number, default: 0 },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Audit trail: who made the entry?
  notes: { type: String }
}, { timestamps: true });

// Compound index to ensure a user only has one master record per day
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

```

---


# Module 9: Documents Management

## 9.1. Document Collection (Digital Asset Workflows)

**Description:** The automated system for requesting, tracking, and receiving digital files (like bank statements, invoices, or ID proofs) from clients via their external portal.

**UI Components & User Stories:**

* **Filtration & Search:** Advanced filtering by Creation Date, Upload Date, Client, Status (e.g., Pending, Uploaded), and a general Search bar.
* **Collection Table:** Displays the Date of request, Client name, associated Task, the specific Message sent to the client, the number of Documents uploaded, the Status, and the User who initiated the request.
* **Actions:** Export data and a "+ New" button to manually initiate a collection request outside of the standard service automation.
* **Workflow:** You can create an automated request with a default message. This triggers a notification to the client and generates a request on their website portal. The client logs in, uploads the documents against your request, and the files are received directly into your dashboard.



**MERN Implementation Notes:**

* **Database Schema (`DocumentRequest`):**
```javascript
const documentRequestSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' }, // Optional: if tied to specific work
  message: { type: String, required: true },
  status: { type: String, enum: ['Pending', 'Partial', 'Fulfilled'], default: 'Pending' },
  uploadedFiles: [{ 
      fileName: String, 
      fileUrl: String, 
      uploadedAt: Date 
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

```



```
* **Storage Architecture (Crucial):** When configuring the Node.js backend on your VPS, avoid the common pitfall of storing these client uploads directly on the local file system. With dozens of clients uploading tax documents and zip files, your server's root disk will quickly hit capacity, leading to application and database crashes. Instead, configure `multer-s3` to stream the multipart form data directly to an object storage bucket (like AWS S3 or DigitalOcean Spaces) and only save the resulting URLs to MongoDB.

---

## 9.2. Documents In-Out Register (Physical Tracking)
**Description:** A digital logbook ensuring physical client assets (like original passbooks, DSC tokens, or hardcopy contracts) are never lost in the office.

**UI Components & User Stories:**
* **Filtration:** Filter by Date, Category (e.g., Received, Given), Doc. Type, Client, Return Date, and whether the item is Returnable.
* **Register Table:** Tracks the Date of the transaction, Document Type, Category, Client, expected Return Date, physical Location in the office, Notes, and the User who logged the entry.
* **Data Entry Workflow:** To make an entry, you select the date, category (Received or Given), and document type[cite: 1]. You must add a note specifying the physical location where the document is stored in the office[cite: 1]. If the document must be returned to the client, you enable the "Returnable" toggle[cite: 1]. 

**MERN Implementation Notes:**
* **Database Schema (`PhysicalDocument`):**
    ```javascript
    const physicalDocumentSchema = new mongoose.Schema({
      clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
      date: { type: Date, required: true },
      category: { type: String, enum: ['Received', 'Given'], required: true },
      documentType: { type: String, required: true }, // e.g., 'Passbook', 'Aadhar Card'
      isReturnable: { type: Boolean, default: false },
      returnDate: { type: Date }, // Populated if isReturnable is true
      location: { type: String }, // e.g., 'Filing Cabinet B, Drawer 3'
      notes: { type: String },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }, { timestamps: true });

```

* **Frontend State Management:** In the "+ New" React modal, the `returnDate` input should be conditionally rendered. It should only appear in the DOM if the user toggles `isReturnable` to `true`.

---

---


# Module 10: Reports Management (Business Intelligence)

## 10.1. The Reporting Interface (Using Clients Report as the Standard)

**Description:** A highly dynamic, filter-heavy view designed to query the database and extract specific cross-sections of agency data.

**UI Components & User Stories:**

* **Comprehensive Filtration Grid:** The interface features multiple dropdowns allowing users to slice data precisely. For example, the Clients Report filters include:
* Search (Text string)
* Recurring Service & Availed Service
* Type (Entity type)
* Tag & Group
* User (Assigned manager)
* Billing Profile


* **Data Table:** A clean, paginated table displaying the results (e.g., Name, File No., Type, Mobile, Email).
* **Export Engine:** A primary "Export" button that translates the current filtered view into a downloadable Excel `.xlsx` file.

**MERN Implementation Notes:**

* **Frontend State (React):** Build a generic, reusable `<ReportLayout />` component. Since you have 17 different reports listed in the sidebar, do not build 17 different page layouts. Pass a configuration object to the component that defines which filter dropdowns to render and which columns the data table should display.

---

## 10.2. Report Categories & Aggregation Strategy

Based on the sidebar and the provided system capabilities, the reports fall into four distinct operational buckets.

### A. Operational & Task Reports

* **Reports:** Tasks Report, Services Report, Passwords Report, Renewals (DSC) Report.
* **Backend Strategy:** For the Tasks Report, you will need to aggregate data across the `Tasks`, `Clients`, `Services`, and `Users` collections using Mongoose `$lookup`. Ensure the `Tasks` collection has indexes on `status`, `dueDate`, and `clientId` to keep queries under 200ms.

### B. Financial & Revenue Reports

* **Reports:** Invoices, Receipts, Expenses, Credit Notes.
* **Backend Strategy:** The Invoices Report requires complex mathematical filtration (e.g., filtering by taxable vs. non-taxable amounts, or finding dues). Use MongoDB's `$match` stage combined with `$expr` to filter documents based on calculated fields (like `$subtract: ["$totals.grandTotal", "$totals.amountPaid"]`).

### C. Client & Ledger Reports

* **Reports:** Clients Report, Unbilled Tasks Report, Unbilled Retainers Report, Client Outstanding Report.
* **Backend Strategy:** The "Unbilled Tasks" and "Client Outstanding" reports are critical for agency cash flow.
* *Unbilled Tasks:* Query `Tasks` where `status === 'Completed'` AND `isBilled === false`.
* *Outstandings:* Query the `Clients` collection and fetch the calculated `ledgerBalance`.



### D. HR & Productivity Reports

* **Reports:** Employees Report, Attendance Report, Employee Wise Time Report, Client Wise Time Report, Timelog Report.
* **Backend Strategy:** Time tracking reports will require grouping data by `userId` or `clientId` and summing up the total `timeSpent` minutes recorded on individual tasks over a specific date range.

---

## 10.3. Lead Developer Architecture: The Excel Export Engine

**The Problem:** Generating an Excel file containing 10,000 client records directly in the React frontend will freeze the user's browser tab and crash the application.

**The MERN Solution:**

1. **Node.js Processing:** Handle the Excel generation strictly on the backend.
2. **Library Selection:** Use a library like `exceljs` or `xlsx` in your Node/Express environment.
3. **The API Flow:** * When the user clicks "Export", React sends a `GET /api/v1/reports/clients/export` request, appending all active filters as query parameters.
* The Node controller fetches the data (bypassing pagination limits to get the full dataset).
* Node builds the Excel workbook in memory.
* Node sets the response headers to force a file download:
`res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');`
`res.setHeader('Content-Disposition', 'attachment; filename="clients_report.xlsx"');`
* The backend streams the file buffer directly back to the client.



---


Managing communications and agency-wide configurations is the final piece of the puzzle. When you transition your freelance work into a fully operational digital agency, this module is what will save you from spending hours chasing clients for documents or payments.

Here is the architectural breakdown for **Module 11: Notification Management** and **Module 12: Settings & Integrations**.

---

# Module 11: Notification Management (The Communications Hub)

Based on the `Send Notifications` screenshots, this module is designed for targeted, bulk outreach. It allows you to query your operational database to find specific subsets of clients and message them simultaneously.

## 11.1. The Targeted Dispatch Interface

**Description:** A multi-tabbed interface for sending manual or bulk messages via Email, SMS, or WhatsApp.

**UI Components & User Stories:**

* **Contextual Tabs:** * *Task Notification:* Alerts regarding upcoming or pending work.
* *Payment Reminder:* Alerts chasing outstanding ledger balances.
* *Custom Notification:* General agency announcements (e.g., office closures, new service offerings).


* **The Query Builder (Filters):** Highly specific dropdowns to narrow the audience.
* Toggle: "Show clients with created tasks only".
* Dropdowns: Service type, Type of client (e.g., LLP, Trust), Client Tag, and Group.


* **"Load Clients" Button:** Executes the query and populates the data table below with the matching audience.
* **Selection & Dispatch:** Checkboxes to select specific users from the loaded list, followed by a "Next" button to compose the message using predefined templates.

**MERN Implementation Notes:**

* **Backend Aggregation Pipeline:** When a user configures the filters and clicks "Load Clients" for a *Payment Reminder*, your Node.js route (`GET /api/v1/notifications/audience/payment`) must query the `Invoices` collection for documents where `status !== 'Paid'`, then use `$lookup` to join the `Clients` collection and apply the requested Tag/Group filters.
* **Asynchronous Job Queues (Crucial Architecture):** Do not use a standard `for` loop in your Express controller to send 500 emails or SMS messages synchronously. This will block Node's single thread and cause the HTTP request to timeout.
* **Solution:** Implement a message broker like **Redis** combined with **BullMQ**. When the user clicks "Send", your Express server instantly responds with a `200 OK` (e.g., "Messages Queued"), while the Redis worker processes the SMTP or external API requests safely in the background.



---

# Module 12: Settings, Integrations & Exports (The Core Configuration)

This module handles the global variables and third-party integrations that dictate how the rest of the application behaves.

## 12.1. Master Settings

**Description:** The CRUD (Create, Read, Update, Delete) interfaces for all lookup tables used in dropdowns across the application.

* **Data Models:** Tags, Document Types, Payment Modes, Client Groups, Expense Categories, and Office Holiday Lists.
* **Implementation:** Keep these endpoints lightweight. Since these arrays are fetched frequently (every time a form opens), cache the results in the frontend state or use a tool like Redis on the backend to avoid constantly hitting MongoDB for static lists.

## 12.2. Billing & Identity Settings

**Description:** Configurations for how the agency presents itself financially.

* **Multi-Entity Management:** Allows the agency to bill under different legal names or GST numbers.
* **Brand Assets:** Uploading firm logos and authorized signatures.
* **Invoice Sequencing:** Configuring the prefix and starting number for auto-generated invoices (e.g., `INV-2026-001`).
* **UPI Integration:** Storing UPI IDs. The backend will use a library like `qrcode` to dynamically generate a scannable payment graphic on the invoice PDF.

## 12.3. Communication Settings & Integrations

**Description:** Connecting the MERN application to the outside world.

* **Custom SMTP:** Allows the agency to send emails from their own domain (e.g., `billing@youragency.com`) rather than a default system email. Stored securely in the database and passed to `nodemailer` during email dispatch.
* **SMS API:** Integration with a gateway like Twilio or a local Indian SMS provider (e.g., Fast2SMS) for transactional alerts.
* **WhatsApp Business API & Chatbot:** * **Implementation:** You will need to set up Webhooks in your Express application to listen for incoming messages from the Meta/WhatsApp API.
* **Chatbot Logic:** You can route incoming WhatsApp text payloads through an LLM API to parse client requests (e.g., "Give me my latest invoice") and trigger automated backend queries to return the PDF link to the chat.



## 12.4. Accounting Export (Tally Integration)

**Description:** Bridging the gap between the SaaS billing engine and standard Indian accounting software.

* **Functionality:** Exporting structured Invoice and Receipt data into XML files.
* **Implementation:** Use a Node.js library like `xmlbuilder2`. You must study Tally's required XML schema, map your MongoDB `Invoice` fields to Tally's tags, and stream the generated `.xml` file to the frontend for download.

## 12.5. My Account (SaaS Subscription)

**Description:** The billing portal for the agency itself to pay for their use of this software.

* **Functionality:** Upgrading plans, viewing subscription status, and downloading software usage invoices.
* **Implementation:** This requires integrating Stripe or Razorpay Subscriptions via webhooks to update the agency's `tenant` or `organization` document in your master database.




Here is the architectural breakdown for **Module 13: Settings & Configurations**, based on the screenshots provided and the operational transcript.

This module acts as the global control panel. It houses the "Master" lookup tables used in dropdowns across the application and defines the core business logic, automation rules, and third-party API keys.

---

# Module 13: Settings (The Agency Control Panel)

## 13.1. User & HR Configurations

**Description:** Defines access controls, system user management, and core HR variables.

* 
**Users & User Roles:** The RBAC matrices we defined in Module 2. This includes setting granular permissions (Create, Edit, View, Delete) across modules.


* **User Notifications:** Master toggles for push and email alerts sent internally to employees.
* **Attendance Settings & Holidays List:** Configures the agency's operational calendar. You set default weekend days off (e.g., Saturday/Sunday) and add specific dates for office holidays. The Attendance grid (Module 8) relies on this to calculate payable days.


* **User Replacement (Critical Feature):** A utility to bulk-transfer responsibilities. If an accountant leaves the agency, this tool reassigns all their pending Tasks, Clients, and Services to a new user in one click.

## 13.2. Client & CRM Configurations

**Description:** Global settings for how client data is structured and categorized.

* 
**Client Settings:** Allows the creation of custom data fields for the client onboarding form and toggles rules like "Allow Duplicate Client Names".


* 
**Client Groups:** A master list (e.g., "Sharma Family", "Tech Startups") used for bulk filtering and notifications.


* 
**Portals List:** A predefined master list of external websites (e.g., GST, Income Tax, PF Portal) used to populate the Password Vault dropdowns.



## 13.3. Billing & Financial Configurations

**Description:** Customizes the agency's financial identity and transaction rules.

* **Billing Settings (Multi-Entity):** You can add multiple billing entities. For each entity, you upload firm logos and signatures, define the auto-generated invoice prefix (e.g., `INV-26-`), configure the UPI ID for QR code generation, and add footer Terms & Conditions.


* 
**Expense Categories:** Master list for classifying internal and client expenses (e.g., Legal, Stationery).


* 
**Payment Modes:** Defines how the agency accepts money (e.g., Cash, HDFC Bank, UPI) for the Receipt generation module.



## 13.4. Automation & Notification Engines

**Description:** The rules engine for when and how the system speaks to clients.

* **Gateway Setup (WhatsApp, SMS, Email):** The integration hub. Here, you configure Custom SMTP credentials (Host, Port, Username, Password) so emails come from the agency's domain. You also link SMS API credits and the WhatsApp Business API (which includes enabling the AI chatbot assistant).


* 
**General Notifications:** Triggers for automated life-cycle events, such as automated birthday greetings, alerts when a client is created, or when an invoice is generated.


* 
**Task Notifications:** Configures the cron job rules for due-date reminders (e.g., send an alert 5 days before the task deadline).



## 13.5. Data, Utilities & Website Builder

**Description:** Core taxonomies and external integrations.

* 
**Tags & Document Types:** Master lists for applying color-coded tags to clients/tasks and categorizing files in the Docs In-Out Register.


* 
**Renewal Types:** Manages the categories for expiring assets (like DSC tokens or Trade Licenses) and sets rules to auto-create tasks before expiry.


* 
**Export Data to Tally:** The utility to extract Invoices and Receipts into Tally-compatible XML files.


* **Website Settings:** The CMS (Content Management System) for the white-labeled client portal. Agencies configure their sub-domain (or link a custom DNS domain), upload a home banner, list their services, and define their "About Us" and Contact details.



---

### Lead Developer Architecture Notes for Settings

Building the Settings module requires a specific approach to database and state management to prevent system lag.

**1. Database Schema Strategy (The "Master" Collections)**
Do not lump all these settings into one giant `AgencySettings` JSON object in MongoDB. It will become a nightmare to query and update.

* Use small, dedicated collections for lists that grow or require relationships (e.g., `ClientGroups`, `ExpenseCategories`, `PaymentModes`, `Tags`).
* Use a single `Configurations` or `TenantSettings` document for global toggles (e.g., `allowDuplicateClients: false`, `attendanceWeekends: [0, 6]`).

**2. Frontend State & Caching (React Context/Redux)**
Because data like `PaymentModes`, `Tags`, and `Users` are needed inside almost every modal across the application (creating an invoice, making a task, adding an expense), **do not fetch them on every component mount.**

* When the user successfully logs into the React app, dispatch a single `GET /api/v1/masters/bootstrap` request.
* The Node backend should package all these lightweight arrays into one JSON payload.
* Store this in global React state. All dropdowns in your app will read from this local state instantly, making the UI feel incredibly fast.

**3. Handling the "User Replacement" Logic**
This is a heavy database operation. When an admin replaces User A with User B:

* The Node controller must execute a `bulkWrite` or use a MongoDB Transaction.
* It must find all `Tasks` where `assignedUserId === User A` and `$set` it to User B.
* It must do the same for `Clients.assignedUsers` and `Services.customUsers`.
