Here is the complete, transparent breakdown of **everything that was skipped, deferred, or simplified** during the implementation of [Phase_4_micro_phase.md](file:///c:/Users/hp/Desktop/Proactive/Backend/docs/Phase_4_micro_phase.md) (Phases 96–120):

---

### 1. Part 20: Client Passwords Security Vault (Phases 96–100)

* **Standalone RBAC Permission Module:**
  * *Skipped:* We did not add a new top-level `passwordVault` key to the strict RBAC permission matrix in `role.schema.ts`.
  * *Current State:* Endpoints rely on JWT `authenticate` and tenant scoping (`tenantId`). Any authenticated tenant user can access vault routes unless Super Admin filters are explicitly layered on top.
* **Auto-Expiring One-Time Reveal Tokens:**
  * *Skipped:* The reveal endpoint (`POST /passwords/:id/reveal`) decrypts and returns plaintext immediately in the HTTP response. We did not build a short-lived (e.g., 60-second) signed token or ephemeral redis session for one-time clipboard destruction.
* **Master Vault Key Encryption Key (KEK) Rotation:**
  * *Simplified:* Uses a single static `VAULT_ENCRYPTION_KEY` from `.env` (with a local development fallback). Envelope encryption with automated key rotation / AWS KMS / HashiCorp Vault was deferred.

---

### 2. Part 21: Client Expenses & Invoicing Bridge (Phases 101–105)

* **Cloud Object Storage (S3 / Cloudflare R2 / Firebase):**
  * *Simplified:* Receipts uploaded via Multer are stored on the local disk file system (`Backend/uploads/receipts/`). Cloud bucket uploads (S3 presigned URLs) were deferred.
* **Dedicated Standalone `/invoices/:id/link-expenses` Endpoint:**
  * *Simplified:* Expense linking is handled atomically when creating or updating an Invoice by including line items with `referenceType: 'Expense'` and `referenceId`. A separate UI-specific bulk linking modal endpoint was not created.
* **Multi-Currency & Foreign Currency Conversion:**
  * *Skipped:* Expenses assume base currency (INR). Foreign currency exchange rate conversion (e.g. paying USD for overseas domain/ROC services) was omitted.

---

### 3. Part 22: Quotations & Pre-Sales CRM Engine (Phases 106–110)

* **Headless Binary PDF Generation (Puppeteer / Chromium):**
  * *Simplified:* `GET /quotations/:id/print` generates an HTML/CSS print-optimized document view rather than spawning headless Chromium via Puppeteer (which would add a ~300MB dependency to the backend container).
* **Automated Expiry Background Cron:**
  * *Simplified:* Quotations check validity on retrieval. A standalone recurring BullMQ cron scanner to automatically flip status from `Sent` to `Expired` at midnight was not wired into `server.ts`.
* **Client Digital Signature Acceptance:**
  * *Skipped:* A public portal URL where clients can type/draw a digital signature to accept the quotation was deferred; quotation status is toggled via `PATCH /quotations/:id/status` by firm staff.

---

### 4. Part 23: BI & Streaming Excel Exports (Phases 111–115)

* **Dynamic Inter-State IGST Calculation in GSTR-1:**
  * *Simplified:* In `getGstSummaryReport`, tax splitting defaults to CGST (50%) + SGST (50%) with `igstAmount: 0`. It does not dynamically compare the Billing Entity's state code against the Client's GSTIN prefix to calculate full IGST for inter-state clients.
* **Streaming Export Batch Size Cap:**
  * *Simplified:* `streamReportExcel` queries up to 10,000 rows per export. True unbounded streaming with MongoDB `.cursor()` cursor timeouts across tens of thousands of records was capped at 10,000 records for server memory safety.
* **WebSocket Export Progress Tracker:**
  * *Skipped:* Exports stream synchronously as direct HTTP file downloads rather than publishing background job progress percentages to Socket.IO.

---

### 5. Part 24: Targeted Communications, Tally XML & Settings (Phases 116–120)

* **Live SMS & WhatsApp Gateway Delivery:**
  * *Mocked/Logged:* In `processBulkNotifications`, SMS and WhatsApp dispatches write rendered message content, timestamps, and recipient mobile numbers into `NotificationLog`. Direct API integration with Meta Cloud API (WhatsApp Business) and SMS providers (Twilio/Gupshup) was deferred until API credentials are provided.
* **BullMQ Rate Limiting Tokens:**
  * *Simplified:* When local Redis is offline, the queue automatically runs via an in-process fallback (`setImmediate`). This fallback path does not enforce BullMQ's 10 emails/sec rate limit.
* **Tally Stock Item Inventory Nodes:**
  * *Skipped:* Tally export maps invoice line items directly to ledger accounts (`Professional Fees` under `<ALLLEDGERENTRIES.LIST>`). Physical stock item inventory tracking (`<ALLINVENTORYENTRIES.LIST>`) was skipped, as Proactive is primarily tailored for professional service firms.
* **Atomic Primary Billing Entity Switcher:**
  * *Simplified:* Multi-entity profiles can be created and fetched (`/tenant-settings/billing-entities`), but an atomic endpoint to designate one entity as default (and unmark all others in a single transaction) was omitted; `isDefault` is passed per entity.

---

### Summary of Residual Technical Debt & Risks

| Category | Skipped Item | Impact | Recommended Next Step |
|---|---|---|---|
| **Storage** | Local disk receipt uploads | Receipts saved on server disk; will not persist in multi-instance stateless cloud containers | Wire AWS S3 / Cloudflare R2 |
| **Comms** | WhatsApp / SMS live gateway | Messages logged in DB but not transmitted over carrier networks | Connect Meta Cloud WhatsApp API |
| **Taxes** | GSTR-1 dynamic IGST | Inter-state invoices show CGST/SGST breakdown instead of IGST | Match Billing Entity state with client GSTIN prefix |
| **Security** | Password Vault RBAC | Any authenticated user in tenant can access vault endpoints | Add `passwordVault` to `role.schema.ts` |