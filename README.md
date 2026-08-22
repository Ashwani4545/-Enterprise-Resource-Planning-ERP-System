# 🚀 ERP System — Scaffold + Auth + Inventory Module

A working slice of a full Enterprise Resource Planning system: JWT authentication
with role-based access control, a PostgreSQL schema, and a complete **Inventory**
module (products, warehouses, suppliers, stock levels, purchase orders, and an
audit trail of every stock change). Built as a template you can extend with the
remaining modules (HR, Finance, Sales, Procurement).

## Stack

- **Frontend:** React 18, React Router, Axios, Recharts
- **Backend:** Node.js, Express
- **Database:** PostgreSQL
- **Auth:** JWT (access + refresh tokens), bcrypt
- **Real-time:** Socket.IO (low-stock alerts)

## Project Structure

```
erp-system/
├── server/
│   ├── config/db.js          # PostgreSQL connection pool
│   ├── controllers/          # auth + inventory business logic
│   ├── middleware/           # JWT auth + role-based access control
│   ├── models/schema.sql     # full DB schema (run this to set up your DB)
│   ├── models/migrate.js     # applies schema.sql
│   ├── routes/                # /api/auth, /api/inventory
│   ├── socket/index.js       # Socket.IO auth + low-stock event
│   └── server.js             # app entry point
└── client/
    └── src/
        ├── pages/            # Login, Register, Dashboard, Inventory
        ├── components/       # Navbar, ProtectedRoute
        └── services/         # api.js (axios + token refresh), AuthContext
```

## 1. Set up the database

```bash
createdb erp_system
# or, in psql:
# CREATE DATABASE erp_system;
```

Copy `server/.env.example` to `server/.env` and fill in your DB credentials
and two random JWT secrets. Then run the migration:

```bash
cd server
cp .env.example .env    # edit DATABASE_URL / DB_* and JWT secrets
npm install
npm run migrate         # creates all tables + seeds the 5 default roles
```

## 2. Start the backend

```bash
cd server
npm run dev              # http://localhost:5000
```

Health check: `GET http://localhost:5000/api/health`

## 3. Start the frontend

```bash
cd client
cp .env.example .env     # points to the API above
npm install
npm start                 # http://localhost:3000
```

## 4. Try it out

1. Go to `/register` and create an account. Pick the `inventory_manager` or
   `super_admin` role so you can add products (other roles are read-only
   on inventory by default — see `server/routes/inventoryRoutes.js`).
2. Log in — you'll land on the dashboard.
3. Go to **Inventory**, add a warehouse and supplier directly via the API
   (or extend the UI — see "Next steps" below), then add products and
   adjust stock. Watch the dashboard chart and low-stock alert update.

## Roles

`super_admin`, `manager`, `employee`, `accountant`, `inventory_manager` — seeded
automatically by the migration. Role names are enforced server-side in
`middleware/roleCheck.js`, not just hidden in the UI.

## API Overview

| Method | Route | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | — | |
| POST | `/api/auth/login` | — | returns access + refresh token |
| POST | `/api/auth/refresh` | — | exchanges refresh token for new access token |
| POST | `/api/auth/logout` | — | revokes refresh token |
| GET | `/api/inventory/products` | any logged-in user | |
| POST | `/api/inventory/products` | `super_admin`, `inventory_manager` | |
| POST | `/api/inventory/stock/adjust` | `super_admin`, `inventory_manager` | writes an audit row + emits `low_stock_alert` |
| POST | `/api/inventory/purchase-orders` | `super_admin`, `inventory_manager` | |
| POST | `/api/inventory/purchase-orders/:id/receive` | `super_admin`, `inventory_manager` | auto-increments stock for every line item |

## Next Steps (per the original project spec)

This scaffold covers Auth + Inventory end-to-end. To build out the rest of the
ERP, follow the same pattern (controller → routes → schema tables → React page):

- **HR module:** employees, departments, attendance, leave, payroll
- **Finance module:** income/expenses, budgets, P&L, balance sheets
- **Sales module:** customers, quotations, orders, invoices
- **Procurement module:** vendors, purchase requests (separate from inventory POs)
- **Reports:** PDF/Excel export of the above
- **Notifications:** persist `low_stock_alert` and similar events to a table,
  not just emit over sockets
- Multi-company / multi-currency support, dark mode, PWA — see the original
  spec's "Bonus Features" section
