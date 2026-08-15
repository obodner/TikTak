import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db } from '../../lib/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { Building2, ShieldAlert, ChevronRight, ExternalLink, Activity } from 'lucide-react';
import { QuotaProgressWidget } from '../../components/admin/QuotaProgressWidget';

export default function EnterpriseFleetDashboard() {
  const params = useParams();
  const targetId = params.tenantId || params.enterpriseId;
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';

  const [parentTenant, setParentTenant] = useState<any>(null);
  const [childBuildings, setChildBuildings] = useState<any[]>([]);
  const [urgentTickets, setUrgentTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFleetData = async () => {
      if (!targetId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        let pDoc = await getDoc(doc(db, "tenants", targetId));
        if (pDoc.exists()) {
          let pData = pDoc.data();
          let masterId = targetId;

          // If navigated via child tenant ID, resolve master parent automatically
          if (pData.usesParentPool && pData.parentEnterpriseId) {
            masterId = pData.parentEnterpriseId;
            const masterDoc = await getDoc(doc(db, "tenants", masterId));
            if (masterDoc.exists()) {
              pDoc = masterDoc;
              pData = masterDoc.data();
            }
          }

          setParentTenant(pData);

          // Include master parent if it's a building, plus all child tenant IDs
          const childIds: string[] = pData.childTenantIds || [];
          const allFleetIds = Array.from(new Set([masterId, ...childIds]));

          const fetchedChildren: any[] = [];
          const allUrgent: any[] = [];

          for (const cId of allFleetIds) {
            const cDoc = await getDoc(doc(db, "tenants", cId));
            if (cDoc.exists()) {
              const cData = cDoc.data();
              // Fetch ticket metrics for this building
              const ticketsSnap = await getDocs(collection(db, "tenants", cId, "tickets"));
              const tDocs = ticketsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

              const openCount = tDocs.filter((t: any) => t.status === 'open').length;
              const inProgressCount = tDocs.filter((t: any) => t.status === 'in-progress').length;
              const backlogCount = tDocs.filter((t: any) => t.status === 'backlog').length;
              const resolvedCount = tDocs.filter((t: any) => t.status === 'resolved').length;
              const highUrgency = tDocs.filter((t: any) => (t.status === 'open' || t.status === 'in-progress' || t.status === 'backlog') && t.urgency === 'High');

              allUrgent.push(...highUrgency.map((t: any) => ({ ...t, buildingName: cData.name || cId, buildingId: cId })));

              fetchedChildren.push({
                id: cId,
                name: cData.name || cId,
                address: cData.address || '',
                type: cData.type || 'building',
                isMaster: cId === masterId,
                totalTickets: tDocs.length,
                openCount,
                inProgressCount,
                backlogCount,
                resolvedCount,
                subscription: cData.subscription || {}
              });
            }
          }

          setChildBuildings(fetchedChildren);
          setUrgentTickets(allUrgent);
        }
      } catch (err) {
        console.error("Failed to load fleet dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFleetData();
  }, [targetId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-medium">
        {isEn ? 'Loading Fleet Data...' : 'טוען נתוני צי...'}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 sm:p-8" dir={isEn ? 'ltr' : 'rtl'}>
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <div className="flex items-center gap-2 text-xs text-blue-600 font-bold mb-1">
              <Building2 className="w-4 h-4" />
              <span>{t('Quota.fleetTitle', 'דשבורד ציים וניהול מרוכב')}</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900">
              {parentTenant?.name || targetId}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {t('Quota.fleetSubhead', 'מבט על מרוכז לניהול כלל המבנים והבניינים')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg border border-blue-100 flex items-center gap-1.5">
              <Activity className="w-4 h-4" />
              {childBuildings.length} {t('Quota.childBuildings', 'בניינים במאגר')}
            </span>
          </div>
        </div>

        {/* Aggregate Parent Quota Widget */}
        {parentTenant && <QuotaProgressWidget tenantData={parentTenant} />}

        {/* Fleet Urgent Alerts Banner */}
        {urgentTickets.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-red-700 font-bold text-sm mb-2">
              <ShieldAlert className="w-4 h-4 text-red-600" />
              <span>{t('Quota.urgentAlerts', 'התראות דחופות בכלל הצי')} ({urgentTickets.length})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {urgentTickets.slice(0, 6).map((ut, idx) => (
                <div key={idx} className="bg-white p-3 rounded-lg border border-red-100 shadow-xs flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-red-600 bg-red-100/60 px-1.5 py-0.5 rounded me-1.5">
                      {ut.buildingName}
                    </span>
                    <p className="text-xs font-bold text-slate-800 mt-1 line-clamp-1">{ut.summary}</p>
                  </div>
                  <button
                    onClick={() => navigate(`/admin/${ut.buildingId}/dashboard`)}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 mt-2 self-start"
                  >
                    <span>{t('Quota.switchBuilding', 'עבור לדשבורד הבניין')}</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Child Buildings Breakdown Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              <span>{t('Quota.childBuildings', 'בניינים במאגר')}</span>
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-slate-700 text-sm text-right rtl:text-right ltr:text-left">
              <thead className="bg-slate-50 text-slate-500 font-semibold text-xs border-b border-slate-100">
                <tr>
                  <th className="p-4">{isEn ? 'Building / Complex' : 'שם הבניין / מתחם'}</th>
                  <th className="p-4">{t('Quota.activeTickets', 'פניות פעילות')}</th>
                  <th className="p-4">{t('Quota.open', 'פתוח')}</th>
                  <th className="p-4">{t('Quota.inProgress', 'בטיפול')}</th>
                  <th className="p-4">{t('Quota.backlog', 'בקלוג')}</th>
                  <th className="p-4">{t('Quota.closed', 'סגור')}</th>
                  <th className="p-4">{t('Quota.switchBuilding', 'פעולה')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {childBuildings.map((bldg) => (
                  <tr key={bldg.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="font-bold text-slate-900">{bldg.name}</div>
                        {bldg.isMaster && (
                          <span className="px-2 py-0.5 text-[10px] font-extrabold rounded bg-blue-100 text-blue-800 border border-blue-200">
                            {isEn ? 'Pool Master' : 'מארח המכסה'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">ID: {bldg.id}</div>
                    </td>
                    <td className="p-4 font-bold text-slate-800">
                      {bldg.openCount + bldg.inProgressCount + bldg.backlogCount}
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                        {bldg.openCount}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
                        {bldg.inProgressCount}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-50 text-purple-700 border border-purple-100">
                        {bldg.backlogCount}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        {bldg.resolvedCount}
                      </span>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => navigate(`/admin/${bldg.id}/dashboard`)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-xs"
                      >
                        <span>{t('Quota.switchBuilding', 'עבור לבניין')}</span>
                        <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
