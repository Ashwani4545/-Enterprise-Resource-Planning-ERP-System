# 🏢 ERP System — Auth + Inventory Module

A working slice of a full **Enterprise Resource Planning (ERP)** platform, built as a production-style scaffold: JWT-based authentication with role-based access control (RBAC), a normalized PostgreSQL schema, and a complete **Inventory** module covering products, warehouses, suppliers, stock levels, purchase orders, and a full audit trail of every stock change — with real-time low-stock alerts over WebSockets.

It's designed as an extensible template: the Auth + Inventory slice is fully implemented end to end (schema → API → UI), and the same pattern can be repeated to add the remaining ERP modules (HR, Finance, Sales, Procurement).

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [1. Database Setup](#1-database-setup)
  - [2. Backend Setup](#2-backend-setup)
  - [3. Frontend Setup](#3-frontend-setup)
  - [4. Try It Out](#4-try-it-out)
- [Roles & Permissions](#roles--permissions)
- [API Overview](#api-overview)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

- 🔐 **JWT Authentication** — access + refresh token flow with `bcrypt` password hashing
- 👥 **Role-Based Access Control** — five seeded roles, enforced server-side (not just hidden in the UI)
- 📦 **Full Inventory Module** — products, warehouses, suppliers, stock levels, purchase orders
- 🧾 **Audit Trail** — every stock adjustment is logged
- ⚡ **Real-Time Alerts** — Socket.IO pushes low-stock events to connected clients live
- 📊 **Dashboard** — visual overview of inventory data via Recharts
- 🧱 **Extensible Architecture** — clean controller → route → schema → page pattern, ready to extend into HR, Finance, Sales, and Procurement modules

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router, Axios, Recharts |
| Backend | Node.js, Express |
| Database | PostgreSQL |
| Auth | JWT (access + refresh tokens), bcrypt |
| Real-time | Socket.IO (low-stock alerts) |

## Project Structure

```
erp-system/
├── server/
│   ├── config/db.js          # PostgreSQL connection pool
│   ├── controllers/          # Auth + inventory business logic
│   ├── middleware/           # JWT auth + role-based access control
│   ├── models/schema.sql     # Full DB schema (run this to set up your DB)
│   ├── models/migrate.js     # Applies schema.sql
│   ├── routes/                # /api/auth, /api/inventory
│   ├── socket/index.js       # Socket.IO auth + low-stock event
│   └── server.js             # App entry point
└── client/
    └── src/
        ├── pages/            # Login, Register, Dashboard, Inventory
        ├── components/       # Navbar, ProtectedRoute
        └── services/         # api.js (Axios + token refresh), AuthContext
```

## Getting Started

### 1. Database Setup

```bash
createdb erp_system
# or, in psql:
# CREATE DATABASE erp_system;
```

Copy `server/.env.example` to `server/.env` and fill in your database credentials and two random JWT secrets. Then run the migration:

```bash
cd server
cp .env.example .env    # edit DATABASE_URL / DB_* and JWT secrets
npm install
npm run migrate         # creates all tables + seeds the 5 default roles
```

### 2. Backend Setup

```bash
cd server
npm run dev              # http://localhost:5000
```

Health check: `GET http://localhost:5000/api/health`

### 3. Frontend Setup

```bash
cd client
cp .env.example .env     # points to the API above
npm install
npm start                 # http://localhost:3000
```

### 4. Try It Out

1. Go to `/register` and create an account. Pick the `inventory_manager` or `super_admin` role so you can add products — other roles are read-only on inventory by default (see `server/routes/inventoryRoutes.js`).
2. Log in — you'll land on the dashboard.
3. Go to **Inventory**, add a warehouse and supplier via the API (or extend the UI), then add products and adjust stock. Watch the dashboard chart and low-stock alert update in real time.

## Roles & Permissions

Five roles are seeded automatically by the migration and enforced server-side in `middleware/roleCheck.js`:

- `super_admin`
- `manager`
- `employee`
- `accountant`
- `inventory_manager`

## API Overview

| Method | Route | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | — | |
| POST | `/api/auth/login` | — | Returns access + refresh token |
| POST | `/api/auth/refresh` | — | Exchanges refresh token for a new access token |
| POST | `/api/auth/logout` | — | Revokes refresh token |
| GET | `/api/inventory/products` | Any logged-in user | |
| POST | `/api/inventory/products` | `super_admin`, `inventory_manager` | |
| POST | `/api/inventory/stock/adjust` | `super_admin`, `inventory_manager` | Writes an audit row + emits `low_stock_alert` |
| POST | `/api/inventory/purchase-orders` | `super_admin`, `inventory_manager` | |
| POST | `/api/inventory/purchase-orders/:id/receive` | `super_admin`, `inventory_manager` | Auto-increments stock for every line item |

## Roadmap

This scaffold covers Auth + Inventory end to end. The rest of the ERP follows the same pattern (controller → routes → schema tables → React page):

- [ ] **HR module** — employees, departments, attendance, leave, payroll
- [ ] **Finance module** — income/expenses, budgets, P&L, balance sheets
- [ ] **Sales module** — customers, quotations, orders, invoices
- [ ] **Procurement module** — vendors, purchase requests (separate from inventory POs)
- [ ] **Reports** — PDF/Excel export
- [ ] **Persistent notifications** — store `low_stock_alert` and similar events in a table, not just emit over sockets
- [ ] **Multi-company / multi-currency support, dark mode, PWA**

## License

No license specified yet — add one (e.g. MIT) if you plan to accept contributions or reuse.

---

Built by [Ashwani4545](https://github.com/Ashwani4545)
