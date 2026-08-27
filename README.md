# 🏢 ERP System — Auth + Inventory + AI Insights

A working slice of a full **Enterprise Resource Planning (ERP)** platform, built as a production-style scaffold: JWT-based authentication with role-based access control (RBAC), a normalized PostgreSQL schema, a complete **Inventory** module covering products, warehouses, suppliers, stock levels, purchase orders, and a full audit trail of every stock change — with real-time low-stock alerts over WebSockets.

What sets this apart from a typical CRUD inventory scaffold is the **AI Insights module**: a machine learning microservice that turns raw stock-audit history into two things a real warehouse team would actually want — automatic reorder recommendations (demand forecasting) and flagged suspicious stock adjustments (anomaly detection) — instead of static thresholds and manual review.

It's designed as an extensible template: Auth, Inventory, and AI Insights are fully implemented end to end (schema → API → UI), and the same pattern can be repeated to add the remaining ERP modules (HR, Finance, Sales, Procurement).

---

## Table of Contents

- [Features](#features)
- [AI Insights Module](#ai-insights-module)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [1. Database Setup](#1-database-setup)
  - [2. Backend Setup](#2-backend-setup)
  - [3. Frontend Setup](#3-frontend-setup)
  - [4. AI Service Setup](#4-ai-service-setup)
  - [5. Try It Out](#5-try-it-out)
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
- 🤖 **AI-Powered Reorder Suggestions** — demand forecasting turns stock-usage history into a recommended reorder point and quantity per product
- 🕵️ **ML Anomaly Detection** — Isolation Forest flags stock adjustments that look unusual for a given product (size, timing, deviation from pattern)
- 🧱 **Extensible Architecture** — clean controller → route → schema → page pattern, ready to extend into HR, Finance, Sales, and Procurement modules

## AI Insights Module

A standalone Python (Flask) microservice, called by the Node backend, adds two ML capabilities on top of the Inventory data:

| Capability | How it works | Endpoint |
|---|---|---|
| **Smart Reorder** | Blends a linear demand trend with a recent moving average over a product's stock-usage history to predict daily demand, then computes a reorder point (`predicted demand over lead time + safety stock`) and a recommended order quantity | `POST /forecast/reorder` |
| **Anomaly Detection** | Runs an Isolation Forest over recent stock adjustments (magnitude, time of day, per-product z-score) to flag adjustments that don't fit a product's normal pattern — e.g. an unusually large write-off at 2 AM | `POST /anomaly/detect` |

The Node backend exposes these to the frontend as `GET /api/ai/reorder-suggestion/:productId` and `GET /api/ai/anomalies`, pulling real history from `stock_audit` and forwarding it to the ML service — the ML service never touches Postgres directly, keeping it stateless and easy to redeploy or swap out.

**Why this matters:** most student ERP projects stop at CRUD + auth. This module turns the audit trail the Inventory module already collects into predictive and protective signal — the same kind of forecasting and anomaly-detection pattern used in real supply-chain and fraud-prevention systems.

See [`ai-service/`](./ai-service) for the microservice and its own setup instructions.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router, Axios, Recharts |
| Backend | Node.js, Express |
| Database | PostgreSQL |
| Auth | JWT (access + refresh tokens), bcrypt |
| Real-time | Socket.IO (low-stock alerts) |
| AI / ML | Python, Flask, scikit-learn (Isolation Forest, Linear Regression), pandas |

## Project Structure

```
erp-system/
├── server/
│   ├── config/db.js          # PostgreSQL connection pool
│   ├── controllers/          # Auth + inventory + AI insights business logic
│   ├── middleware/           # JWT auth + role-based access control
│   ├── models/schema.sql     # Full DB schema (run this to set up your DB)
│   ├── models/migrate.js     # Applies schema.sql
│   ├── routes/                # /api/auth, /api/inventory, /api/ai
│   ├── socket/index.js       # Socket.IO auth + low-stock event
│   └── server.js             # App entry point
├── ai-service/
│   ├── app.py                # Flask microservice: reorder forecasting + anomaly detection
│   └── requirements.txt
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

### 4. AI Service Setup

```bash
cd ai-service
python -m venv venv && source venv/bin/activate   # optional but recommended
pip install -r requirements.txt
python app.py             # http://localhost:6000
```

Then set `AI_SERVICE_URL=http://localhost:6000` in `server/.env` so the Node backend knows where to reach it. Health check: `GET http://localhost:6000/health`.

> Both AI endpoints need a minimum amount of history to return a result (3+ days of usage for forecasting, 10+ adjustments for anomaly detection) — run the app for a bit or seed some sample `stock_audit` rows before testing them.

### 5. Try It Out

1. Go to `/register` and create an account. Pick the `inventory_manager` or `super_admin` role so you can add products — other roles are read-only on inventory by default (see `server/routes/inventoryRoutes.js`).
2. Log in — you'll land on the dashboard.
3. Go to **Inventory**, add a warehouse and supplier via the API (or extend the UI), then add products and adjust stock. Watch the dashboard chart and low-stock alert update in real time.
4. Once there's enough stock-adjustment history, hit `GET /api/ai/reorder-suggestion/:productId` for a reorder recommendation, or `GET /api/ai/anomalies` (as `super_admin`/`inventory_manager`) to see any flagged adjustments.

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
| GET | `/api/ai/reorder-suggestion/:productId` | Any logged-in user | Predicted demand + recommended reorder point/quantity |
| GET | `/api/ai/anomalies` | `super_admin`, `inventory_manager` | Recent stock adjustments flagged as statistically unusual |

## Roadmap

This scaffold covers Auth + Inventory end to end. The rest of the ERP follows the same pattern (controller → routes → schema tables → React page):

- [ ] **HR module** — employees, departments, attendance, leave, payroll
- [ ] **Finance module** — income/expenses, budgets, P&L, balance sheets
- [ ] **Sales module** — customers, quotations, orders, invoices
- [ ] **Procurement module** — vendors, purchase requests (separate from inventory POs)
- [ ] **Reports** — PDF/Excel export
- [ ] **Persistent notifications** — store `low_stock_alert` and similar events in a table, not just emit over sockets
- [ ] **Multi-company / multi-currency support, dark mode, PWA**
- [ ] **AI Insights v2** — swap the linear-trend forecaster for a seasonality-aware model (e.g. Prophet) once enough historical data exists, and add a feedback loop that scores past reorder suggestions against actual stockouts

## License

MIT — see [LICENSE](./LICENSE).

---

Built by [Ashwani4545](https://github.com/Ashwani4545)
