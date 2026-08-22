-- ============================================================
-- ERP System Database Schema
-- Modules covered: Auth / RBAC, Inventory
-- Engine: PostgreSQL 14+
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ------------------------------------------------------------
-- AUTH & RBAC
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) UNIQUE NOT NULL,   -- super_admin, manager, employee, accountant, inventory_manager
    description TEXT
);

INSERT INTO roles (name, description) VALUES
    ('super_admin', 'Full system access'),
    ('manager', 'Manages department operations'),
    ('employee', 'Standard employee access'),
    ('accountant', 'Finance module access'),
    ('inventory_manager', 'Inventory module access')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name     VARCHAR(150) NOT NULL,
    email         VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Refresh tokens (for logout / token revocation support)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked    BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- INVENTORY MODULE
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS warehouses (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(150) NOT NULL,
    location   VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(150) NOT NULL,
    contact_email VARCHAR(150),
    contact_phone VARCHAR(50),
    address       TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
    id             SERIAL PRIMARY KEY,
    sku            VARCHAR(60) UNIQUE NOT NULL,
    name           VARCHAR(200) NOT NULL,
    description    TEXT,
    unit_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
    reorder_level  INTEGER NOT NULL DEFAULT 10,  -- triggers low-stock notification
    supplier_id    INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Stock levels per product per warehouse
CREATE TABLE IF NOT EXISTS stock_levels (
    id           SERIAL PRIMARY KEY,
    product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    quantity     INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE (product_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id           SERIAL PRIMARY KEY,
    supplier_id  INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    status       VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending, approved, received, cancelled
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id                 SERIAL PRIMARY KEY,
    purchase_order_id  INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id         INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity           INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost          NUMERIC(12,2) NOT NULL
);

-- Full audit trail of every stock change (purchase receipt, sale, manual adjustment)
CREATE TABLE IF NOT EXISTS stock_movements (
    id           SERIAL PRIMARY KEY,
    product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    change_qty   INTEGER NOT NULL,              -- positive = stock in, negative = stock out
    reason       VARCHAR(50) NOT NULL,           -- purchase_receipt, sale, manual_adjustment, transfer
    reference_id INTEGER,                        -- e.g. purchase_order_id
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_levels_product ON stock_levels(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
