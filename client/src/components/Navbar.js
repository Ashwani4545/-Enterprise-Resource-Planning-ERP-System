import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/dashboard">🚀 ERP System</Link>
      </div>
      <div className="navbar-links">
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/inventory">Inventory</Link>
      </div>
      {user && (
        <div className="navbar-user">
          <span>{user.fullName} · {user.role}</span>
          <button onClick={handleLogout} className="btn btn-secondary">Logout</button>
        </div>
      )}
    </nav>
  );
}
