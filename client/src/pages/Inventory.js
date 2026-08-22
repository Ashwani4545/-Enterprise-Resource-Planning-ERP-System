import React, { useEffect, useState } from 'react';
import api from '../services/api';
import Navbar from '../components/Navbar';
import { useAuth } from '../services/AuthContext';

const CAN_WRITE = ['super_admin', 'inventory_manager'];

export default function Inventory() {
  const { user } = useAuth();
  const canWrite = CAN_WRITE.includes(user?.role);

  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [newProduct, setNewProduct] = useState({ sku: '', name: '', unitPrice: '', reorderLevel: 10 });
  const [adjustment, setAdjustment] = useState({ productId: '', warehouseId: '', changeQty: '', reason: 'manual_adjustment' });

  async function loadData() {
    setLoading(true);
    try {
      const [productsRes, warehousesRes] = await Promise.all([
        api.get('/inventory/products'),
        api.get('/inventory/warehouses'),
      ]);
      setProducts(productsRes.data.products);
      setWarehouses(warehousesRes.data.warehouses);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleAddProduct(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.post('/inventory/products', {
        sku: newProduct.sku,
        name: newProduct.name,
        unitPrice: Number(newProduct.unitPrice),
        reorderLevel: Number(newProduct.reorderLevel),
      });
      setNewProduct({ sku: '', name: '', unitPrice: '', reorderLevel: 10 });
      setMessage('Product added successfully.');
      loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add product');
    }
  }

  async function handleAdjustStock(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/inventory/stock/adjust', {
        productId: Number(adjustment.productId),
        warehouseId: Number(adjustment.warehouseId),
        changeQty: Number(adjustment.changeQty),
        reason: adjustment.reason,
      });
      setMessage(
        data.lowStock
          ? `Stock updated to ${data.newQuantity} — this is at or below the reorder level!`
          : `Stock updated to ${data.newQuantity}.`
      );
      setAdjustment({ productId: '', warehouseId: '', changeQty: '', reason: 'manual_adjustment' });
      loadData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to adjust stock');
    }
  }

  return (
    <div>
      <Navbar />
      <main className="page">
        <h1>Inventory</h1>
        <p className="page-subtitle">Manage products, stock levels, and warehouses.</p>

        {error && <div className="auth-error">{error}</div>}
        {message && <div className="auth-success">{message}</div>}

        <div className="table-card">
          <h3>Products</h3>
          {loading ? (
            <p>Loading...</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU</th><th>Name</th><th>Unit Price</th><th>Total Stock</th><th>Reorder Level</th><th>Supplier</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className={Number(p.total_stock) <= p.reorder_level ? 'row-warning' : ''}>
                    <td>{p.sku}</td>
                    <td>{p.name}</td>
                    <td>${Number(p.unit_price).toFixed(2)}</td>
                    <td>{p.total_stock}</td>
                    <td>{p.reorder_level}</td>
                    <td>{p.supplier_name || '—'}</td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr><td colSpan={6}>No products yet. Add one below.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {canWrite && (
          <div className="forms-grid">
            <form className="form-card" onSubmit={handleAddProduct}>
              <h3>Add Product</h3>
              <label>SKU</label>
              <input value={newProduct.sku} onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })} required />
              <label>Name</label>
              <input value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} required />
              <label>Unit Price</label>
              <input type="number" step="0.01" min="0" value={newProduct.unitPrice} onChange={(e) => setNewProduct({ ...newProduct, unitPrice: e.target.value })} required />
              <label>Reorder Level</label>
              <input type="number" min="0" value={newProduct.reorderLevel} onChange={(e) => setNewProduct({ ...newProduct, reorderLevel: e.target.value })} />
              <button type="submit" className="btn btn-primary">Add Product</button>
            </form>

            <form className="form-card" onSubmit={handleAdjustStock}>
              <h3>Adjust Stock</h3>
              <label>Product</label>
              <select value={adjustment.productId} onChange={(e) => setAdjustment({ ...adjustment, productId: e.target.value })} required>
                <option value="">Select product</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </select>
              <label>Warehouse</label>
              <select value={adjustment.warehouseId} onChange={(e) => setAdjustment({ ...adjustment, warehouseId: e.target.value })} required>
                <option value="">Select warehouse</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <label>Change quantity (use negative to remove stock)</label>
              <input type="number" value={adjustment.changeQty} onChange={(e) => setAdjustment({ ...adjustment, changeQty: e.target.value })} required />
              <label>Reason</label>
              <select value={adjustment.reason} onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })}>
                <option value="manual_adjustment">Manual adjustment</option>
                <option value="sale">Sale</option>
                <option value="transfer">Transfer</option>
              </select>
              <button type="submit" className="btn btn-primary">Adjust Stock</button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
