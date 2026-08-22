const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const ctrl = require('../controllers/inventoryController');

const CAN_WRITE = ['super_admin', 'inventory_manager'];

// All inventory routes require a logged-in user.
router.use(authenticate);

// Products
router.get('/products', ctrl.listProducts);
router.get('/products/:id', ctrl.getProduct);
router.post('/products', requireRole(...CAN_WRITE), ctrl.createProduct);
router.put('/products/:id', requireRole(...CAN_WRITE), ctrl.updateProduct);
router.delete('/products/:id', requireRole('super_admin'), ctrl.deleteProduct);

// Warehouses
router.get('/warehouses', ctrl.listWarehouses);
router.post('/warehouses', requireRole(...CAN_WRITE), ctrl.createWarehouse);

// Suppliers
router.get('/suppliers', ctrl.listSuppliers);
router.post('/suppliers', requireRole(...CAN_WRITE), ctrl.createSupplier);

// Stock
router.post('/stock/adjust', requireRole(...CAN_WRITE), ctrl.adjustStock);
router.get('/stock/movements/:productId', ctrl.getStockMovements);

// Purchase Orders
router.get('/purchase-orders', ctrl.listPurchaseOrders);
router.post('/purchase-orders', requireRole(...CAN_WRITE), ctrl.createPurchaseOrder);
router.post('/purchase-orders/:id/receive', requireRole(...CAN_WRITE), ctrl.receivePurchaseOrder);

module.exports = router;
