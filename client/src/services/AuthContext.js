import React, { createContext, useContext, useEffect, useState } from 'react';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('erpUser');
    if (stored) setUser(JSON.parse(stored));
    setLoading(false);
  }, []);

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('erpUser', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  async function register(fullName, email, password, role) {
    await api.post('/auth/register', { fullName, email, password, role });
  }

  async function logout() {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch {
      // Ignore network errors on logout - clear local state regardless.
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('erpUser');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
