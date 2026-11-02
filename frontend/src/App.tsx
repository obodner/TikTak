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
import ResidentSelfJoinPage from './pages/ResidentSelfJoinPage';

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

    // Clean any stray Meta template placeholders like {{1}} or %7B%7B1%7D%7D from slug
    let cleanSlug = decodeURIComponent(slug);
    try {
        cleanSlug = decodeURIComponent(cleanSlug);
    } catch {
        // already decoded
    }
    cleanSlug = cleanSlug
        .replace(/\{\{\d+\}\}/g, '')
        .replace(/%7B%7B\d+%7D%7D/gi, '')
        .split('?')[0]
        .split('&')[0]
        .trim();

    const parts = cleanSlug.split('__');
    const tenantId = parts[0]?.trim();
    const rfqId = parts[1]?.trim();

    if (!tenantId) {
        return <Navigate to="/" replace />;
    }

    if (!rfqId) {
        return (
            <Navigate
                to={`/admin/${tenantId}/quotes/active?modal=compare&alert=quote&tab=open`}
                replace
            />
        );
    }

    return (
        <Navigate
            to={`/admin/${tenantId}/quotes/active?rfqId=${rfqId}&modal=compare&alert=quote&tab=open`}
            replace
        />
    );
}

// Quick Short Redirect for Contractor WhatsApp Dynamic Button: /vq/:slug, /quotes/:slug, /quotes/vq/:slug, /quote/vq/:slug -> /quote/:tenantId/:rfqId?v=...&t=...
function VendorQuoteQuickRedirect() {
    const params = useParams();
    const slug = params.slug || '';
    const splat = params['*'] || '';
    const [searchParams] = useSearchParams();

    // If URL is /quotes/vq/<actualSlug> or /vq/vq/<actualSlug>, the actual __ slug is in splat ('*')
    const rawSlug = (splat && splat.includes('__'))
        ? splat
        : (slug && slug.includes('__'))
            ? slug
            : (splat || slug);

    if (!rawSlug) {
        return <Navigate to="/" replace />;
    }

    let cleanSlug = decodeURIComponent(rawSlug);
    try {
        cleanSlug = decodeURIComponent(cleanSlug);
    } catch {
        // already decoded
    }

    // Extract any embedded query string if '?' or '%3F' was encoded into the slug
    let embeddedQuery = '';
    if (cleanSlug.includes('?')) {
        const [pathPart, qPart] = cleanSlug.split('?');
        cleanSlug = pathPart;
        embeddedQuery = qPart || '';
    }

    cleanSlug = cleanSlug
        .replace(/^vq\//i, '')
        .replace(/^quotes?\//i, '')
        .replace(/\{\{\d+\}\}/g, '')
        .replace(/%7B%7B\d+%7D%7D/gi, '')
        .replace(/[{}]/g, '')
        .split('&')[0]
        .trim();

    const parts = cleanSlug.split('__');
    const embeddedParams = new URLSearchParams(embeddedQuery);

    // Format A: tenantId__rfqId__vendorId__tokenHash
    if (parts.length >= 2) {
        const tenantId = parts[0]?.trim();
        const rfqId = parts[1]?.trim();
        const vendorId = parts[2]?.trim() || searchParams.get('v') || embeddedParams.get('v') || '';
        const tokenHash = parts[3]?.trim() || searchParams.get('t') || embeddedParams.get('t') || '';

        if (!tenantId || !rfqId) {
            return <Navigate to="/" replace />;
        }

        const queryParams = new URLSearchParams();
        if (vendorId) queryParams.set('v', vendorId);
        if (tokenHash) queryParams.set('t', tokenHash);
        queryParams.set('tid', tenantId);

        const queryStr = queryParams.toString();
        return (
            <Navigate
                to={`/quote/${tenantId}/${rfqId}${queryStr ? `?${queryStr}` : ''}`}
                replace
            />
        );
    }

    // Format B: /quotes/:rfqId?tid=...&v=...&t=...
    const singleRfqId = parts[0]?.trim();
    const tid = searchParams.get('tid') || searchParams.get('tenant') || embeddedParams.get('tid') || '';
    const v = searchParams.get('v') || searchParams.get('vendorId') || embeddedParams.get('v') || '';
    const t = searchParams.get('t') || searchParams.get('token') || embeddedParams.get('t') || '';

    if (singleRfqId && singleRfqId !== 'vq') {
        const queryParams = new URLSearchParams();
        if (v) queryParams.set('v', v);
        if (t) queryParams.set('t', t);
        if (tid) queryParams.set('tid', tid);
        const queryStr = queryParams.toString();
        const targetPath = tid ? `/quote/${tid}/${singleRfqId}` : `/quote/${singleRfqId}`;
        return (
            <Navigate
                to={`${targetPath}${queryStr ? `?${queryStr}` : ''}`}
                replace
            />
        );
    }

    return <Navigate to="/" replace />;
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

function AdminQuotesIndexRedirect() {
    const [searchParams] = useSearchParams();
    const search = searchParams.toString();
    return <Navigate to={`active${search ? `?${search}` : ''}`} replace />;
}

export default function App() {
    const isProdDomain =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'www.mytiktak.com' ||
            window.location.hostname === 'mytiktak.com' ||
            window.location.hostname === 'tiktak2026.web.app' ||
            window.location.hostname === 'tiktak2026.firebaseapp.com');

    const shouldRedirectToStaging =
        isProdDomain &&
        (window.location.href.includes('env=stg') ||
            window.location.href.includes('env%3Dstg'));

    useEffect(() => {
        if (shouldRedirectToStaging) {
            window.location.replace(
                `https://tiktak-stg.web.app${window.location.pathname}${window.location.search}${window.location.hash}`
            );
            return;
        }
        if (!sessionStorage.getItem('tiktak_session_id')) {
            sessionStorage.setItem('tiktak_session_id', Math.random().toString(36).substring(2, 15));
        }
    }, [shouldRedirectToStaging]);

    if (shouldRedirectToStaging) {
        return null;
    }

    return (
        <>
            <ScrollToTop />
            <Routes>
            {/* WhatsApp Dynamic Button Short Redirect (Single Slug for Meta URL Validation) */}
            <Route path="/q/:slug" element={<RfqQuickRedirect />} />
            <Route path="/q/:slug/*" element={<RfqQuickRedirect />} />

            {/* Contractor Short Redirects (Single Slug for Meta URL Button Validation) */}
            <Route path="/vq/:slug" element={<VendorQuoteQuickRedirect />} />
            <Route path="/vq/:slug/*" element={<VendorQuoteQuickRedirect />} />
            <Route path="/quotes/:slug" element={<VendorQuoteQuickRedirect />} />
            <Route path="/quotes/:slug/*" element={<VendorQuoteQuickRedirect />} />
            <Route path="/quote/vq/:slug" element={<VendorQuoteQuickRedirect />} />
            <Route path="/quote/vq/:slug/*" element={<VendorQuoteQuickRedirect />} />

            {/* Resident facing UI -> strictly public */}
            <Route path="/" element={<HomeRoute />} />
            <Route path="/report/:tenantId" element={<ResidentFlow />} />
            <Route path="/report/:tenantId/dashboard" element={<ResidentDashboard />} />
            <Route path="/join/:slug" element={<ResidentSelfJoinPage />} />
            <Route path="/join/:tenantId/:token" element={<ResidentSelfJoinPage />} />

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
                <Route path="quotes" element={<AdminQuotesIndexRedirect />} />
                <Route path="quotes/new" element={<NewRfqPage />} />
                <Route path="quotes/active" element={<ActiveQuotesPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </>
    );
}
