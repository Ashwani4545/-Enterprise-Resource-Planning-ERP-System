const { query, getClient } = require('../config/db');
const crypto = require('crypto');

// ---------------------------------------------------------------
// PRODUCTS
// ---------------------------------------------------------------

async function listProducts(req, res) {
  try {
    const result = await query(
      `SELECT p.id, p.sku, p.name, p.description, p.unit_price, p.reorder_level,
              s.name AS supplier_name,
              COALESCE(SUM(i.quantity), 0) AS total_stock
       FROM products p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN inventory i ON i.product_id = p.id
       GROUP BY p.id
       ORDER BY p.name`
    );
    res.json({ products: result.rows });
  } catch (err) {
    console.error('listProducts error:', err.message);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
}

async function getProduct(req, res) {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT p.* FROM products p WHERE p.id = ?`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });

    const stockResult = await query(
      `SELECT i.warehouse_id, w.name AS warehouse_name, i.quantity
       FROM inventory i 
       JOIN warehouses w ON w.id = i.warehouse_id
       WHERE i.product_id = ?`,
      [id]
    );

    res.json({ product: result.rows[0], stockByWarehouse: stockResult.rows });
  } catch (err) {
    console.error('getProduct error:', err.message);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
}

async function createProduct(req, res) {
  try {
    const { sku, name, description, unitPrice, reorderLevel, supplierId } = req.body;
    if (!sku || !name || unitPrice === undefined) {
      return res.status(400).json({ error: 'sku, name and unitPrice are required' });
    }

    const result = await query(
      `INSERT INTO products (sku, name, description, unit_price, reorder_level, supplier_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sku, name, description || null, unitPrice, reorderLevel ?? 10, supplierId || null]
    );
    res.status(201).json({ product: { id: result.lastID, sku, name, description, unit_price: unitPrice, reorder_level: reorderLevel, supplier_id: supplierId } });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A product with this SKU already exists' });
    }
    console.error('createProduct error:', err.message);
    res.status(500).json({ error: 'Failed to create product' });
  }
}

async function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const { name, description, unitPrice, reorderLevel, supplierId } = req.body;

    let updates = [];
    let params = [];
    
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (unitPrice !== undefined) { updates.push('unit_price = ?'); params.push(unitPrice); }
    if (reorderLevel !== undefined) { updates.push('reorder_level = ?'); params.push(reorderLevel); }
    if (supplierId !== undefined) { updates.push('supplier_id = ?'); params.push(supplierId); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const result = await query(
      `UPDATE products SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    
    if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    
    const updated = await query('SELECT * FROM products WHERE id = ?', [id]);
    res.json({ product: updated.rows[0] });
  } catch (err) {
    console.error('updateProduct error:', err.message);
    res.status(500).json({ error: 'Failed to update product' });
  }
}

async function deleteProduct(req, res) {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM products WHERE id = ?', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('deleteProduct error:', err.message);
    res.status(500).json({ error: 'Failed to delete product' });
  }
}

// ---------------------------------------------------------------
// WAREHOUSES
// ---------------------------------------------------------------

async function listWarehouses(req, res) {
  try {
    const result = await query('SELECT * FROM warehouses ORDER BY name');
    res.json({ warehouses: result.rows });
  } catch (err) {
    console.error('listWarehouses error:', err.message);
    res.status(500).json({ error: 'Failed to fetch warehouses' });
  }
}

async function createWarehouse(req, res) {
  try {
    const { name, location } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const result = await query(
      'INSERT INTO warehouses (name, location) VALUES (?, ?)',
      [name, location || null]
    );
    res.status(201).json({ warehouse: { id: result.lastID, name, location } });
  } catch (err) {
    console.error('createWarehouse error:', err.message);
    res.status(500).json({ error: 'Failed to create warehouse' });
  }
}

// ---------------------------------------------------------------
// SUPPLIERS
// ---------------------------------------------------------------

async function listSuppliers(req, res) {
  try {
    const result = await query('SELECT * FROM suppliers ORDER BY name');
    res.json({ suppliers: result.rows });
  } catch (err) {
    console.error('listSuppliers error:', err.message);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
}

async function createSupplier(req, res) {
  try {
    const { name, contactEmail, contactPhone, address } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const result = await query(
      `INSERT INTO suppliers (name, contact_email, contact_phone, address)
       VALUES (?, ?, ?, ?)`,
      [name, contactEmail || null, contactPhone || null, address || null]
    );
    res.status(201).json({ supplier: { id: result.lastID, name, contact_email: contactEmail, contact_phone: contactPhone, address } });
  } catch (err) {
    console.error('createSupplier error:', err.message);
    res.status(500).json({ error: 'Failed to create supplier' });
  }
}

// ---------------------------------------------------------------
// INVENTORY MANAGEMENT
// ---------------------------------------------------------------

async function getInventory(req, res) {
  try {
    const result = await query(
      `SELECT i.id, p.id AS product_id, p.sku, p.name, w.id AS warehouse_id, w.name AS warehouse_name,
              i.quantity, i.last_updated
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       JOIN warehouses w ON w.id = i.warehouse_id
       ORDER BY p.name, w.name`
    );
    res.json({ inventory: result.rows });
  } catch (err) {
    console.error('getInventory error:', err.message);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
}

async function adjustStock(req, res) {
  try {
    const { productId, warehouseId, quantityChange, notes } = req.body;
    if (!productId || !warehouseId || quantityChange === undefined) {
      return res.status(400).json({ error: 'productId, warehouseId, and quantityChange are required' });
    }

    // Check if inventory record exists
    const existing = await query(
      'SELECT id, quantity FROM inventory WHERE product_id = ? AND warehouse_id = ?',
      [productId, warehouseId]
    );

    let newQuantity = quantityChange;
    if (existing.rowCount > 0) {
      newQuantity = existing.rows[0].quantity + quantityChange;
      if (newQuantity < 0) {
        return res.status(400).json({ error: 'Insufficient stock' });
      }
      await query(
        'UPDATE inventory SET quantity = ?, last_updated = CURRENT_TIMESTAMP WHERE product_id = ? AND warehouse_id = ?',
        [newQuantity, productId, warehouseId]
      );
    } else {
      if (quantityChange < 0) {
        return res.status(400).json({ error: 'Cannot create negative inventory' });
      }
      await query(
        'INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES (?, ?, ?)',
        [productId, warehouseId, quantityChange]
      );
    }

    // Record stock movement
    const movementId = crypto.randomUUID();
    await query(
      `INSERT INTO stock_movements (id, product_id, warehouse_id, movement_type, quantity, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [movementId, productId, warehouseId, quantityChange > 0 ? 'in' : 'out', Math.abs(quantityChange), notes || null]
    );

    res.json({ message: 'Stock adjusted successfully', newQuantity });
  } catch (err) {
    console.error('adjustStock error:', err.message);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
}

module.exports = {
  // Products
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  // Warehouses
  listWarehouses,
  createWarehouse,
  // Suppliers
  listSuppliers,
  createSupplier,
  // Inventory
  getInventory,
  adjustStock,
  // Stock movements (stub for now)
  async getStockMovements(req, res) {
    try {
      const { productId } = req.params;
      const result = await query(
        'SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC',
        [productId]
      );
      res.json({ movements: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch stock movements' });
    }
  },
  // Purchase Orders (stubs for now)
  async listPurchaseOrders(req, res) {
    res.json({ purchaseOrders: [] });
  },
  async createPurchaseOrder(req, res) {
    res.status(201).json({ purchaseOrder: { id: 1, status: 'pending' } });
  },
  async receivePurchaseOrder(req, res) {
    res.json({ message: 'Purchase order received' });
  },
};
