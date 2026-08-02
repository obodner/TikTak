import { useState, useEffect, useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { collection, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthState } from '../../hooks/useAuthState';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { logAction } from '../../utils/auditLogger';
import { ClosureModal } from '../../components/admin/ClosureModal';
import { ListTodo, GripVertical, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export type BacklogColumnId = 'important-urgent' | 'important-not-urgent' | 'not-important-urgent';

export interface BacklogTicket {
  id: string;
  category: string;
  createdAt: string;
  imageId?: string;
  audioId?: string;
  status: 'open' | 'in-progress' | 'resolved' | 'dismissed' | 'backlog';
  backlogColumn?: BacklogColumnId;
  backlogOrder?: number;
  backloggedAt?: string;
  summary: string;
  urgency: 'High' | 'Moderate' | 'Low';
  location?: string;
  subLocation?: string;
  ticketNumber?: number;
  source?: string;
}

export default function TasksBacklog() {
  const { tenantId } = useParams();
  const { user, loading: authLoading } = useAuthState();

  const [tickets, setTickets] = useState<BacklogTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [closureTicketId, setClosureTicketId] = useState<string | null>(null);

  const isEn = false;

  const getAuditActor = () => ({
    uid: user?.uid || 'unknown',
    name: user?.displayName || user?.email || 'Admin',
    email: user?.email || undefined,
    type: 'admin' as const
  });

  const columnsConfig: { id: BacklogColumnId; titleHe: string; titleEn: string; colorClass: string; borderClass: string; badgeClass: string }[] = [
    {
      id: 'important-urgent',
      titleHe: '🔴 חשוב ודחוף',
      titleEn: '🔴 Important & Urgent',
      colorClass: 'bg-red-50/50',
      borderClass: 'border-red-200',
      badgeClass: 'bg-red-600 text-white'
    },
    {
      id: 'important-not-urgent',
      titleHe: '🟠 חשוב ולא דחוף',
      titleEn: '🟠 Important & Not Urgent',
      colorClass: 'bg-amber-50/50',
      borderClass: 'border-amber-200',
      badgeClass: 'bg-amber-600 text-white'
    },
    {
      id: 'not-important-urgent',
      titleHe: '🟡 לא חשוב ודחוף',
      titleEn: '🟡 Not Important & Urgent',
      colorClass: 'bg-blue-50/50',
      borderClass: 'border-blue-200',
      badgeClass: 'bg-blue-600 text-white'
    }
  ];

  const fetchBacklogTickets = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "tenants", tenantId, "tickets"));
      const allTickets = snap.docs.map(d => ({ id: d.id, ...d.data() } as BacklogTicket));
      // Filter only backlog tickets
      const backlogOnly = allTickets.filter(t => t.status === 'backlog');

      // Ensure backlogColumn & backlogOrder fallbacks
      const parsed: BacklogTicket[] = backlogOnly.map(t => {
        let order = t.backlogOrder;
        if (order === undefined || order === null) {
          const tTime = new Date(t.backloggedAt || t.createdAt || 0).getTime();
          order = tTime > 0 ? -tTime : 0;
        }
        return {
          ...t,
          backlogColumn: t.backlogColumn || 'important-urgent',
          backlogOrder: order
        };
      });

      setTickets(parsed);
    } catch (err) {
      console.error("Failed to load backlog tickets:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && tenantId) {
      fetchBacklogTickets();
    }
  }, [user, tenantId]);

  // Map tickets into columns sorted by backlogOrder
  const columnsData = useMemo(() => {
    const map: Record<BacklogColumnId, BacklogTicket[]> = {
      'important-urgent': [],
      'important-not-urgent': [],
      'not-important-urgent': []
    };

    tickets.forEach(t => {
      const col = t.backlogColumn || 'important-urgent';
      if (map[col]) {
        map[col].push(t);
      } else {
        map['important-urgent'].push(t);
      }
    });

    // Sort each column by backlogOrder ascending; fallback to newest backloggedAt/createdAt first
    (Object.keys(map) as BacklogColumnId[]).forEach(colId => {
      map[colId].sort((a, b) => {
        const orderA = a.backlogOrder ?? 0;
        const orderB = b.backlogOrder ?? 0;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        const timeA = new Date(a.backloggedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.backloggedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
    });

    return map;
  }, [tickets]);

  // Handle Drag & Drop
  const onDragEnd = async (result: any) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const sourceCol = source.droppableId as BacklogColumnId;
    const destCol = destination.droppableId as BacklogColumnId;
    const ticketId = draggableId;
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    // Create shallow copy of column arrays
    const newColumnsData = {
      'important-urgent': [...columnsData['important-urgent']],
      'important-not-urgent': [...columnsData['important-not-urgent']],
      'not-important-urgent': [...columnsData['not-important-urgent']]
    };

    // Remove from source
    const [movedTicket] = newColumnsData[sourceCol].splice(source.index, 1);
    movedTicket.backlogColumn = destCol;

    // Insert into destination
    newColumnsData[destCol].splice(destination.index, 0, movedTicket);

    // Re-assign backlogOrder indices for the destination column
    const updatedDestTickets = newColumnsData[destCol].map((t, idx) => ({
      ...t,
      backlogOrder: idx
    }));

    // If source column is different, also reindex source column
    let updatedSourceTickets: BacklogTicket[] = [];
    if (sourceCol !== destCol) {
      updatedSourceTickets = newColumnsData[sourceCol].map((t, idx) => ({
        ...t,
        backlogOrder: idx
      }));
    }

    // Merge all back into flat array state for instant smooth UI update
    const nextFlatState = tickets.map(t => {
      const destMatch = updatedDestTickets.find(dt => dt.id === t.id);
      if (destMatch) return destMatch;
      const sourceMatch = updatedSourceTickets.find(st => st.id === t.id);
      if (sourceMatch) return sourceMatch;
      return t;
    });

    setTickets(nextFlatState);

    // Persist to Firestore in batch
    try {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();

      updatedDestTickets.forEach(t => {
        const ref = doc(db, "tenants", tenantId as string, "tickets", t.id);
        batch.update(ref, {
          backlogColumn: t.backlogColumn,
          backlogOrder: t.backlogOrder,
          updatedAt: nowIso
        });
      });

      if (sourceCol !== destCol) {
        updatedSourceTickets.forEach(t => {
          const ref = doc(db, "tenants", tenantId as string, "tickets", t.id);
          batch.update(ref, {
            backlogColumn: t.backlogColumn,
            backlogOrder: t.backlogOrder,
            updatedAt: nowIso
          });
        });
      }

      await batch.commit();

      // Audit Log
      await logAction({
        tenantId: tenantId as string,
        action: 'BACKLOG_TICKET_REORDERED',
        actor: getAuditActor(),
        details: {
          ticketId,
          ticketNumber: ticket.ticketNumber,
          fromColumn: sourceCol,
          toColumn: destCol,
          newOrderIndex: destination.index
        }
      });
    } catch (err) {
      console.error("Failed to persist drag and drop reorder:", err);
      fetchBacklogTickets(); // Rollback on failure
    }
  };

  // Handle changing ticket status from Backlog card
  const handleStatusChangeFromBacklog = async (t: BacklogTicket, newStatus: string) => {
    if (!tenantId) return;

    if (newStatus === 'resolved') {
      setClosureTicketId(t.id);
      return;
    }

    setUpdatingId(t.id);
    try {
      const ticketRef = doc(db, "tenants", tenantId, "tickets", t.id);
      const nowIso = new Date().toISOString();

      await updateDoc(ticketRef, {
        status: newStatus,
        updatedAt: nowIso
      });

      // Audit Log
      await logAction({
        tenantId,
        action: 'TICKET_STATUS_UPDATE',
        actor: getAuditActor(),
        details: {
          ticketId: t.id,
          ticketNumber: t.ticketNumber,
          newStatus,
          movedFromBacklog: true
        },
        changes: { previousValue: { status: 'backlog' }, newValue: { status: newStatus } }
      });

      // Remove from local backlog state
      setTickets(prev => prev.filter(item => item.id !== t.id));
    } catch (err) {
      console.error("Failed to change status from backlog:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Handle closure modal resolution
  const handleModalResolve = async (ticketId: string, reasonId: string, notes: string) => {
    if (!tenantId || !ticketId) return;
    const ticketObj = tickets.find(t => t.id === ticketId);

    try {
      const ticketRef = doc(db, "tenants", tenantId, "tickets", ticketId);
      const nowIso = new Date().toISOString();

      await updateDoc(ticketRef, {
        status: 'resolved',
        closureReason: reasonId,
        resolutionNote: notes,
        resolvedAt: nowIso,
        updatedAt: nowIso
      });

      await logAction({
        tenantId,
        action: 'TICKET_STATUS_UPDATE',
        actor: getAuditActor(),
        details: {
          ticketId,
          ticketNumber: ticketObj?.ticketNumber,
          newStatus: 'resolved',
          closureReason: reasonId,
          resolutionNote: notes,
          movedFromBacklog: true
        },
        changes: { previousValue: { status: 'backlog' }, newValue: { status: 'resolved' } }
      });

      setTickets(prev => prev.filter(t => t.id !== ticketId));
      setClosureTicketId(null);
    } catch (err) {
      console.error("Resolution failed:", err);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-medium">
        טוען מצבור משימות...
      </div>
    );
  }

  if (!user) return <Navigate to="/admin/login" />;

  return (
    <div className="min-h-screen bg-slate-50 font-sans" dir={isEn ? 'ltr' : 'rtl'}>
      <main className="max-w-7xl mx-auto p-4 md:p-8 flex flex-col gap-6">
        {/* Header Title Banner */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <ListTodo size={28} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900">
                {isEn ? 'Tasks Backlog' : 'מצבור משימות'}
              </h1>
              <p className="text-sm text-slate-500 font-medium mt-0.5">
                {isEn
                  ? 'Eisenhower priority matrix for deferred maintenance & long-term projects.'
                  : 'מטריצת תיעדוף משימות דחויות, תוכנית עבודה ופרויקטים ארוכי טווח.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200">
              {tickets.length} {isEn ? 'Backlogged Tasks' : 'משימות במצבור'}
            </span>
          </div>
        </div>

        {/* 3-Column Kanban Board */}
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {columnsConfig.map(col => {
              const colTickets = columnsData[col.id] || [];

              return (
                <div
                  key={col.id}
                  className={`flex flex-col ${col.colorClass} border ${col.borderClass} rounded-2xl p-4 min-h-[550px] shadow-sm`}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between mb-4 px-1">
                    <h2 className="font-extrabold text-slate-800 text-base md:text-lg">
                      {isEn ? col.titleEn : col.titleHe}
                    </h2>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${col.badgeClass}`}>
                      {colTickets.length}
                    </span>
                  </div>

                  {/* Droppable Container */}
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className={`flex-1 flex flex-col gap-3 rounded-xl p-1.5 transition-colors ${
                          snapshot.isDraggingOver ? 'bg-blue-100/40 ring-2 ring-blue-400/30' : ''
                        }`}
                      >
                        {colTickets.length === 0 && (
                          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200/80 rounded-xl p-6 text-center text-slate-400">
                            <AlertCircle size={24} className="mb-2 opacity-50" />
                            <span className="text-xs font-medium">
                              {isEn ? 'No tasks in this column' : 'אין משימות בעמודה זו'}
                            </span>
                          </div>
                        )}

                        {colTickets.map((t, index) => (
                          <Draggable key={t.id} draggableId={t.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`bg-white p-4 rounded-xl shadow-sm border border-slate-200 transition-all relative group ${
                                  snapshot.isDragging
                                    ? 'rotate-2 scale-105 shadow-xl ring-2 ring-blue-500/30 z-50'
                                    : 'hover:shadow-md'
                                }`}
                              >
                                {/* Card Top Row: Grip Handle, Priority & Status Switcher */}
                                <div className="flex items-start justify-between gap-2 mb-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <div
                                      {...provided.dragHandleProps}
                                      className="text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-100 shrink-0"
                                      title={isEn ? "Drag to reorder" : "גרור כדי לשנות עמודה או עדיפות"}
                                    >
                                      <GripVertical size={16} />
                                    </div>
                                    <span className="text-[11px] font-black text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                                      #{t.ticketNumber}
                                    </span>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                                      t.urgency === 'High' ? 'bg-red-100 text-red-700' :
                                      t.urgency === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                                      'bg-green-100 text-green-700'
                                    }`}>
                                      {t.urgency === 'High' ? (isEn ? 'High' : 'דחוף') :
                                       t.urgency === 'Moderate' ? (isEn ? 'Moderate' : 'בינוני') : (isEn ? 'Low' : 'נמוך')}
                                    </span>
                                  </div>

                                  {/* Status Selector - Allow moving back to active dashboard */}
                                  <select
                                    value={t.status}
                                    disabled={updatingId === t.id}
                                    onChange={(e) => handleStatusChangeFromBacklog(t, e.target.value)}
                                    className="text-xs font-bold px-2 py-1 rounded border border-slate-200 bg-slate-50 text-slate-700 cursor-pointer focus:ring-2 focus:ring-blue-200 outline-none"
                                  >
                                    <option value="backlog">{isEn ? 'Backlog' : 'מצבור משימות'}</option>
                                    <option value="open">{isEn ? 'New' : 'חדש (לדשבורד)'}</option>
                                    <option value="in-progress">{isEn ? 'In Progress' : 'בטיפול (לדשבורד)'}</option>
                                    <option value="resolved">{isEn ? 'Resolved' : 'טופל'}</option>
                                    <option value="dismissed">{isEn ? 'Dismissed' : 'בוטל'}</option>
                                  </select>
                                </div>

                                {/* Category & Summary */}
                                <div className="mb-3">
                                  <div className="text-base font-black text-slate-900 mb-1">
                                    {t.category}
                                  </div>
                                  <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed font-medium">
                                    {t.summary || (isEn ? 'No summary' : 'אין תיאור')}
                                  </p>
                                </div>

                                {/* Card Footer Tags: Location & Date */}
                                <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold pt-2 border-t border-slate-100">
                                  <div className="flex items-center gap-1 truncate max-w-[160px]">
                                    {t.location && (
                                      <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold truncate">
                                        {t.location}
                                      </span>
                                    )}
                                    {t.subLocation && (
                                      <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-bold truncate">
                                        {t.subLocation}
                                      </span>
                                    )}
                                  </div>

                                  <span>
                                    {format(parseISO(t.createdAt), 'dd/MM/yy')}
                                  </span>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </main>

      {/* Closure Modal for resolving backlog tickets */}
      <ClosureModal
        isOpen={!!closureTicketId}
        onClose={() => setClosureTicketId(null)}
        ticket={tickets.find(t => t.id === closureTicketId) || null}
        onConfirm={handleModalResolve}
        isEn={isEn}
      />
    </div>
  );
}
