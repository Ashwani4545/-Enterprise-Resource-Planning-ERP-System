import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../services/api';
import Navbar from '../components/Navbar';
import { useAuth } from '../services/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const { data } = await api.get('/inventory/products');
        setProducts(data.products);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const totalStockValue = products.reduce(
    (sum, p) => sum + Number(p.unit_price) * Number(p.total_stock),
    0
  );
  const lowStockCount = products.filter((p) => Number(p.total_stock) <= p.reorder_level).length;
  const chartData = products.slice(0, 8).map((p) => ({ name: p.name, stock: Number(p.total_stock) }));

  return (
    <div>
      <Navbar />
      <main className="page">
        <h1>Welcome, {user?.fullName}</h1>
        <p className="page-subtitle">Here's what's happening across your business today.</p>

        {error && <div className="auth-error">{error}</div>}

        <div className="dashboard-grid">
          <div className="dashboard-card">
            <h3>Total Products</h3>
            <p className="stat">{loading ? '—' : products.length}</p>
          </div>
          <div className="dashboard-card">
            <h3>Inventory Value</h3>
            <p className="stat">{loading ? '—' : `$${totalStockValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</p>
          </div>
          <div className="dashboard-card">
            <h3>Low Stock Alerts</h3>
            <p className="stat stat-warning">{loading ? '—' : lowStockCount}</p>
          </div>
          <div className="dashboard-card">
            <h3>Your Role</h3>
            <p className="stat">{user?.role.replace('_', ' ')}</p>
          </div>
        </div>

        {!loading && chartData.length > 0 && (
          <div className="dashboard-card chart-card">
            <h3>Stock Levels by Product</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="stock" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </main>
    </div>
  );
}
