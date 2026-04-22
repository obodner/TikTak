import { Routes, Route, Navigate } from 'react-router-dom';
import ResidentFlow from './pages/ResidentFlow';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import TenantSettings from './pages/admin/TenantSettings';

export default function App() {
  return (
    <Routes>
      {/* Resident facing UI -> strictly public */}
      <Route path="/" element={<ResidentFlow />} />
      <Route path="/report/:tenantId" element={<ResidentFlow />} />
      
      {/* Auth Portal */}
      <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      
      {/* Protected Admin Routes */}
      <Route path="/admin/:tenantId/dashboard" element={<AdminDashboard />} />
      <Route path="/admin/:tenantId/settings" element={<TenantSettings />} />
      
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
