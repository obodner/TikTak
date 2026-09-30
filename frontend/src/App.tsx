import { Routes, Route, Navigate, useSearchParams, useLocation, useParams } from 'react-router-dom';
import ResidentFlow from './pages/ResidentFlow';
import LandingPage from './pages/LandingPage';
import ResidentDashboard from './pages/ResidentDashboard';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import TenantSettings from './pages/admin/TenantSettings';
import TasksBacklog from './pages/admin/TasksBacklog';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import SuperAdminDashboard from './pages/admin/SuperAdminDashboard';
import EnterpriseFleetDashboard from './pages/admin/EnterpriseFleetDashboard';
import NewRfqPage from './pages/admin/NewRfqPage';
import ActiveQuotesPage from './pages/admin/ActiveQuotesPage';
import ContractorQuotePortal from './pages/ContractorQuotePortal';
import RfqProductLandingPage from './pages/RfqProductLandingPage';

import { AdminLayout } from './components/admin/AdminLayout';
import { SessionEnforcer } from './components/admin/SessionEnforcer';
import { SuperAdminEnforcer } from './components/admin/SuperAdminEnforcer';
import { useEffect } from 'react';

function ScrollToTop() {
    const { pathname, hash } = useLocation();

    useEffect(() => {
        if (hash) {
            const element = document.getElementById(hash.replace('#', ''));
            if (element) {
                element.scrollIntoView({ behavior: 'smooth' });
                return;
            }
        }
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, [pathname, hash]);

    return null;
}

// Quick Short Redirect for WhatsApp Dynamic Button: /q/:slug -> /admin/:tenantId/quotes?rfqId=...
function RfqQuickRedirect() {
    const { slug } = useParams();
    if (!slug) {
        return <Navigate to="/" replace />;
    }

    const parts = slug.split('__');
    const tenantId = parts[0];
    const rfqId = parts[1];

    if (!tenantId || !rfqId) {
        return <Navigate to="/" replace />;
    }

    return (
        <Navigate
            to={`/admin/${tenantId}/quotes?rfqId=${rfqId}&modal=compare&alert=quote&tab=open`}
            replace
        />
    );
}

// Wrapper to dynamically load LandingPage or ResidentFlow based on QR query params
function HomeRoute() {
    const [searchParams] = useSearchParams();
    const hasVendor = searchParams.has('v') || searchParams.has('vendorId');
    if (hasVendor) {
        const rfq = searchParams.get('rfq') || searchParams.get('rfqId') || '';
        return <Navigate to={`/quote/${rfq}${window.location.search}`} replace />;
    }
    const hasTenant =
        searchParams.has('t') ||
        searchParams.has('tenant') ||
        searchParams.has('b') ||
        searchParams.has('building');

    if (hasTenant) {
        return <ResidentFlow />;
    }
    return <LandingPage />;
}

function AdminIndexRedirect() {
    const [searchParams] = useSearchParams();
    const search = searchParams.toString();
    return <Navigate to={`dashboard${search ? `?${search}` : ''}`} replace />;
}

export default function App() {
    useEffect(() => {
        if (!sessionStorage.getItem('tiktak_session_id')) {
            sessionStorage.setItem('tiktak_session_id', Math.random().toString(36).substring(2, 15));
        }
    }, []);

    return (
        <>
            <ScrollToTop />
            <Routes>
            {/* WhatsApp Dynamic Button Short Redirect (Single Slug for Meta URL Validation) */}
            <Route path="/q/:slug" element={<RfqQuickRedirect />} />

            {/* Resident facing UI -> strictly public */}
            <Route path="/" element={<HomeRoute />} />
            <Route path="/report/:tenantId" element={<ResidentFlow />} />
            <Route path="/report/:tenantId/dashboard" element={<ResidentDashboard />} />

            {/* Dedicated Product Page for RFQ Procurement */}
            <Route path="/rfq" element={<RfqProductLandingPage />} />
            <Route path="/procurement" element={<Navigate to="/rfq" replace />} />

            {/* Contractor Facing RFQ Quoting Portal -> strictly public */}
            <Route path="/quote/:rfqId" element={<ContractorQuotePortal />} />
            <Route path="/quote/:rfqId/*" element={<ContractorQuotePortal />} />
            <Route path="/quote/:tenantId/:rfqId" element={<ContractorQuotePortal />} />
            <Route path="/quote/:tenantId/:rfqId/*" element={<ContractorQuotePortal />} />

            {/* Auth Portal */}
            <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* Protected Admin Routes */}
            <Route path="/admin/god-view" element={
                <SuperAdminEnforcer>
                    <SuperAdminDashboard />
                </SuperAdminEnforcer>
            } />
            <Route path="/admin/:tenantId" element={
                <SessionEnforcer>
                    <AdminLayout />
                </SessionEnforcer>
            }>
                <Route index element={<AdminIndexRedirect />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="settings" element={<TenantSettings />} />
                <Route path="backlog" element={<TasksBacklog />} />
                <Route path="analytics" element={<AdminAnalytics />} />
                <Route path="fleet" element={<EnterpriseFleetDashboard />} />
                <Route path="quotes" element={<Navigate to="active" replace />} />
                <Route path="quotes/new" element={<NewRfqPage />} />
                <Route path="quotes/active" element={<ActiveQuotesPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </>
    );
}