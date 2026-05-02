import { Routes, Route, Navigate } from 'react-router-dom';
import ResidentFlow from './pages/ResidentFlow';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import TenantSettings from './pages/admin/TenantSettings';
import SuperAdminDashboard from './pages/admin/SuperAdminDashboard';

import { SessionEnforcer } from './components/admin/SessionEnforcer';
import { SuperAdminEnforcer } from './components/admin/SuperAdminEnforcer';
import { useEffect } from 'react';

export default function App() {
  useEffect(() => {
    if (!sessionStorage.getItem('tiktak_session_id')) {
      sessionStorage.setItem('tiktak_session_id', Math.random().toString(36).substring(2, 15));
    }
  }, []);

  return (
    <Routes>
      {/* Resident facing UI -> strictly public */}
      <Route path="/" element={<ResidentFlow />} />
      <Route path="/report/:tenantId" element={<ResidentFlow />} />
      
      {/* Auth Portal */}
      <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      
      {/* Protected Admin Routes */}
      <Route path="/admin/god-view" element={
        <SuperAdminEnforcer>
          <SuperAdminDashboard />
        </SuperAdminEnforcer>
      } />
      <Route path="/admin/:tenantId/dashboard" element={
        <SessionEnforcer>
          <AdminDashboard />
        </SessionEnforcer>
      } />
      <Route path="/admin/:tenantId/settings" element={
        <SessionEnforcer>
          <TenantSettings />
        </SessionEnforcer>
      } />
      
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
