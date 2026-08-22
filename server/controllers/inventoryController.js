const { query, getClient } = require('../config/db');

// ---------------------------------------------------------------
// PRODUCTS
// ---------------------------------------------------------------

async function listProducts(req, res) {
  try {
    const result = await query(
      `SELECT p.id, p.sku, p.name, p.description, p.unit_price, p.reorder_level,
              s.name AS supplier_name,
              COALESCE(SUM(sl.quantity), 0) AS total_stock
       FROM products p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN stock_levels sl ON sl.product_id = p.id
       GROUP BY p.id, s.name
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
      `SELECT p.*, s.name AS supplier_name
       FROM products p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.id = $1`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });

    const stockResult = await query(
      `SELECT sl.warehouse_id, w.name AS warehouse_name, sl.quantity
       FROM stock_levels sl JOIN warehouses w ON w.id = sl.warehouse_id
       WHERE sl.product_id = $1`,
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
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [sku, name, description || null, unitPrice, reorderLevel ?? 10, supplierId || null]
    );
    res.status(201).json({ product: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
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

    const result = await query(
      `UPDATE products
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           unit_price = COALESCE($3, unit_price),
           reorder_level = COALESCE($4, reorder_level),
           supplier_id = COALESCE($5, supplier_id),
           updated_at = now()
       WHERE id = $6
       RETURNING *`,
      [name, description, unitPrice, reorderLevel, supplierId, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('updateProduct error:', err.message);
    res.status(500).json({ error: 'Failed to update product' });
  }
}

async function deleteProduct(req, res) {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error('deleteProduct error:', err.message);
    res.status(500).json({ error: 'Failed to delete product' });
  }
}

// ---------------------------------------------------------------
// WAREHOUSES & SUPPLIERS
// ---------------------------------------------------------------

async function listWarehouses(req, res) {
  try {
    const result = await query('SELECT * FROM warehouses ORDER BY name');
    res.json({ warehouses: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch warehouses' });
  }
}

async function createWarehouse(req, res) {
  try {
    const { name, location } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await query(
      'INSERT INTO warehouses (name, location) VALUES ($1, $2) RETURNING *',
      [name, location || null]
    );
    res.status(201).json({ warehouse: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create warehouse' });
  }
}

async function listSuppliers(req, res) {
  try {
    const result = await query('SELECT * FROM suppliers ORDER BY name');
    res.json({ suppliers: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
}

async function createSupplier(req, res) {
  try {
    const { name, contactEmail, contactPhone, address } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await query(
      `INSERT INTO suppliers (name, contact_email, contact_phone, address)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, contactEmail || null, contactPhone || null, address || null]
    );
    res.status(201).json({ supplier: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create supplier' });
  }
}

// ---------------------------------------------------------------
// STOCK ADJUSTMENTS
// Every change goes through this function so stock_levels and the
// stock_movements audit trail always stay in sync (wrapped in a transaction).
// ---------------------------------------------------------------

async function adjustStock(req, res) {
  const client = await getClient();
  try {
    const { productId, warehouseId, changeQty, reason, referenceId } = req.body;
    if (!productId || !warehouseId || !changeQty || !reason) {
      return res.status(400).json({ error: 'productId, warehouseId, changeQty and reason are required' });
    }

    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT quantity FROM stock_levels WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`,
      [productId, warehouseId]
    );

    let newQuantity;
    if (existing.rowCount === 0) {
      newQuantity = changeQty;
      if (newQuantity < 0) throw new Error('Cannot reduce stock below zero for a new stock record');
      await client.query(
        `INSERT INTO stock_levels (product_id, warehouse_id, quantity) VALUES ($1, $2, $3)`,
        [productId, warehouseId, newQuantity]
      );
    } else {
      newQuantity = existing.rows[0].quantity + changeQty;
      if (newQuantity < 0) throw new Error('Insufficient stock for this operation');
      await client.query(
        `UPDATE stock_levels SET quantity = $1, updated_at = now()
         WHERE product_id = $2 AND warehouse_id = $3`,
        [newQuantity, productId, warehouseId]
      );
    }

    await client.query(
      `INSERT INTO stock_movements (product_id, warehouse_id, change_qty, reason, reference_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [productId, warehouseId, changeQty, reason, referenceId || null, req.user?.id || null]
    );

    await client.query('COMMIT');

    // Low-stock check (for the notifications module to pick up / socket emit)
    const productResult = await client.query('SELECT reorder_level, name FROM products WHERE id = $1', [productId]);
    const lowStock = productResult.rowCount > 0 && newQuantity <= productResult.rows[0].reorder_level;

    res.json({
      message: 'Stock updated',
      productId,
      warehouseId,
      newQuantity,
      lowStock,
    });

    if (lowStock && req.app.get('io')) {
      req.app.get('io').emit('low_stock_alert', {
        productId,
        productName: productResult.rows[0].name,
        warehouseId,
        quantity: newQuantity,
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('adjustStock error:', err.message);
    res.status(400).json({ error: err.message || 'Failed to adjust stock' });
  } finally {
    client.release();
  }
}

async function getStockMovements(req, res) {
  try {
    const { productId } = req.params;
    const result = await query(
      `SELECT sm.*, w.name AS warehouse_name
       FROM stock_movements sm JOIN warehouses w ON w.id = sm.warehouse_id
       WHERE sm.product_id = $1
       ORDER BY sm.created_at DESC
       LIMIT 100`,
      [productId]
    );
    res.json({ movements: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stock movements' });
  }
}

// ---------------------------------------------------------------
// PURCHASE ORDERS
// ---------------------------------------------------------------

async function createPurchaseOrder(req, res) {
  const client = await getClient();
  try {
    const { supplierId, warehouseId, items } = req.body; // items: [{ productId, quantity, unitCost }]
    if (!supplierId || !warehouseId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'supplierId, warehouseId and a non-empty items array are required' });
    }

    await client.query('BEGIN');
    const poResult = await client.query(
      `INSERT INTO purchase_orders (supplier_id, warehouse_id, status, created_by)
       VALUES ($1, $2, 'pending', $3) RETURNING *`,
      [supplierId, warehouseId, req.user?.id || null]
    );
    const po = poResult.rows[0];

    for (const item of items) {
      if (!item.productId || !item.quantity || item.unitCost === undefined) {
        throw new Error('Each item requires productId, quantity and unitCost');
      }
      await client.query(
        `INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost)
         VALUES ($1, $2, $3, $4)`,
        [po.id, item.productId, item.quantity, item.unitCost]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ purchaseOrder: po, items });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createPurchaseOrder error:', err.message);
    res.status(400).json({ error: err.message || 'Failed to create purchase order' });
  } finally {
    client.release();
  }
}

/**
 * Marks a PO as received and automatically increases stock for every line item.
 */
async function receivePurchaseOrder(req, res) {
  const client = await getClient();
  try {
    const { id } = req.params;

    await client.query('BEGIN');
    const poResult = await client.query('SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE', [id]);
    if (poResult.rowCount === 0) throw new Error('Purchase order not found');
    const po = poResult.rows[0];
    if (po.status === 'received') throw new Error('Purchase order already received');

    const itemsResult = await client.query('SELECT * FROM purchase_order_items WHERE purchase_order_id = $1', [id]);

    for (const item of itemsResult.rows) {
      const existing = await client.query(
        'SELECT quantity FROM stock_levels WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE',
        [item.product_id, po.warehouse_id]
      );
      if (existing.rowCount === 0) {
        await client.query(
          'INSERT INTO stock_levels (product_id, warehouse_id, quantity) VALUES ($1, $2, $3)',
          [item.product_id, po.warehouse_id, item.quantity]
        );
      } else {
        await client.query(
          'UPDATE stock_levels SET quantity = quantity + $1, updated_at = now() WHERE product_id = $2 AND warehouse_id = $3',
          [item.quantity, item.product_id, po.warehouse_id]
        );
      }
      await client.query(
        `INSERT INTO stock_movements (product_id, warehouse_id, change_qty, reason, reference_id, created_by)
         VALUES ($1, $2, $3, 'purchase_receipt', $4, $5)`,
        [item.product_id, po.warehouse_id, item.quantity, po.id, req.user?.id || null]
      );
    }

    await client.query(`UPDATE purchase_orders SET status = 'received', updated_at = now() WHERE id = $1`, [id]);
    await client.query('COMMIT');

    res.json({ message: 'Purchase order received and stock updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('receivePurchaseOrder error:', err.message);
    res.status(400).json({ error: err.message || 'Failed to receive purchase order' });
  } finally {
    client.release();
  }
}

async function listPurchaseOrders(req, res) {
  try {
    const result = await query(
      `SELECT po.*, s.name AS supplier_name, w.name AS warehouse_name
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       JOIN warehouses w ON w.id = po.warehouse_id
       ORDER BY po.created_at DESC`
    );
    res.json({ purchaseOrders: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  listWarehouses,
  createWarehouse,
  listSuppliers,
  createSupplier,
  adjustStock,
  getStockMovements,
  createPurchaseOrder,
  receivePurchaseOrder,
  listPurchaseOrders,
};
