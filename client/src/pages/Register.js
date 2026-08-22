import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';

const ROLES = ['employee', 'manager', 'accountant', 'inventory_manager', 'super_admin'];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'employee' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(form.fullName, form.email, form.password, form.role);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Create an account</h1>
        <p className="auth-subtitle">Join your organization's ERP workspace</p>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">Account created! Redirecting to login...</div>}

        <label>Full name</label>
        <input value={form.fullName} onChange={(e) => update('fullName', e.target.value)} required />

        <label>Email</label>
        <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />

        <label>Password (min. 8 characters)</label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
          minLength={8}
          required
        />

        <label>Role</label>
        <select value={form.role} onChange={(e) => update('role', e.target.value)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r.replace('_', ' ')}</option>
          ))}
        </select>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Register'}
        </button>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
