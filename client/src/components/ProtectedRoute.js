import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../services/AuthContext';

/**
 * Wraps a page and redirects to /login if no user is signed in.
 * Pass `allowedRoles` to additionally restrict by role.
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <div className="page-forbidden">You don't have access to this page.</div>;
  }
  return children;
}
