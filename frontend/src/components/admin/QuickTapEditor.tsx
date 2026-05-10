import React from 'react';
import { 
  DragDropContext, 
  Droppable, 
  Draggable, 
  DropResult 
} from '@hello-pangea/dnd';
import { 
  GripVertical, 
  Plus, 
  Trash2, 
  Settings2, 
  MessageSquare, 
  MapPin, 
  Tag, 
  AlertCircle,
  Edit2,
  X
} from 'lucide-react';

export interface QuickTapItem {
  id: string;
  emoji: string;
  category: string;
  location: string;
  subLocation: string;
  urgency: string;
  summary: string;
}

interface QuickTapEditorProps {
  items: QuickTapItem[];
  onChange: (items: QuickTapItem[]) => void;
  onSave: (items: QuickTapItem[]) => void;
  categories: string[];
  locations: string[];
  subLocations: string[];
}

const CATEGORY_EMOJI_MAP: Record<string, string> = {
  'אשפה ומיחזור': '♻️',
  'בטחון': '🛡️',
  'ביוב ונזילות': '💧',
  'גינון/נוף': '🌳',
  'חשמל': '💡',
  'מפגע בדרך': '🚧',
  'פסולת/ניקיון': '🧹',
  'תאורת רחוב': '💡',
  'תחזוקה': '🔧',
  'מעלית': '🛗',
  'אחר': '⚡'
};

const getEmojiForCategory = (category: string) => CATEGORY_EMOJI_MAP[category] || '⚡';

export const QuickTapEditor: React.FC<QuickTapEditorProps> = ({
  items,
  onChange,
  onSave,
  categories,
  locations,
  subLocations
}) => {
  const [draft, setDraft] = React.useState<QuickTapItem | null>(null);
  const [isAdding, setIsAdding] = React.useState(false);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(items);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    onChange(reordered);
    // Auto-save order changes too
    onSave(reordered);
  };

  const addItem = () => {
    if (items.length >= 6) return;
    const newItem: QuickTapItem = {
      id: crypto.randomUUID(),
      emoji: '⚡',
      category: '',
      location: '',
      subLocation: '',
      urgency: 'Moderate',
      summary: ''
    };
    setDraft(newItem);
    setIsAdding(true);
  };

  const removeItem = (id: string) => {
    const newItems = items.filter(item => item.id !== id);
    onChange(newItems);
    onSave(newItems);
  };

  const isDraftValid = draft && draft.summary.trim() !== '' && draft.category !== '' && (draft.location !== '' || draft.subLocation !== '');

  const handleApplyDraft = () => {
    if (!isDraftValid) return;
    
    let newItems;
    if (isAdding) {
      newItems = [...items, draft];
    } else {
      newItems = items.map(item => item.id === draft.id ? draft : item);
    }
    
    onChange(newItems);
    setDraft(null);
    setIsAdding(false);
    
    // Auto-save the whole tenant config
    onSave(newItems);
  };

  const updateDraft = (updates: Partial<QuickTapItem>) => {
    if (!draft) return;
    const updated = { ...draft, ...updates };
    if (updates.category) {
      updated.emoji = getEmojiForCategory(updates.category);
    }
    setDraft(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Settings2 size={20} className="text-blue-600" />
          ניהול כפתורי דיווח מהיר (QuickTap)
        </h3>
        <button
          onClick={addItem}
          disabled={items.length >= 6}
          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm transition-all disabled:opacity-50"
        >
          <Plus size={16} />
          הוסף כפתור ({items.length}/6)
        </button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="quicktap-list">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-3"
            >
              {items.map((item, index) => (
                <Draggable key={item.id} draggableId={item.id} index={index}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm relative group"
                    >
                      <div className="flex items-start gap-4">
                        <div
                          {...provided.dragHandleProps}
                          className="mt-2 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
                        >
                          <GripVertical size={20} />
                        </div>

                        <div className="flex-1 flex items-center gap-3">
                          <div className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-xl shadow-sm">
                            {item.emoji}
                          </div>
                          
                          <div className="flex-1">
                            <div className="text-sm font-black text-slate-900 mb-0.5">
                              {item.summary || 'ללא תיאור'}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase">
                                {item.category || 'ללא קטגוריה'}
                              </span>
                              {(item.location || item.subLocation) && (
                                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                  <span>{item.location}</span>
                                  {item.subLocation && (
                                    <>
                                      <span className="opacity-50">&gt;</span>
                                      <span>{item.subLocation}</span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setDraft({ ...item });
                              setIsAdding(false);
                            }}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="ערוך"
                          >
                            <Edit2 size={18} />
                          </button>
                          
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="מחק"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {items.length === 0 && (
        <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
          לא נוספו כפתורי דיווח מהיר. לחץ על "הוסף כפתור" כדי להתחיל.
        </div>
      )}
      
      <p className="text-[11px] text-slate-500 italic">
        * ניתן להגדיר עד 6 כפתורים. הסדר כאן משמש לניהול בלבד; בדף הדייר הכפתורים ימוינו לפי סוג האמוג\'י.
      </p>

      {/* EDIT MODAL */}
      {draft && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => {
            setDraft(null);
            setIsAdding(false);
          }} />
          <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" dir="rtl">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h4 className="font-black text-slate-800">{isAdding ? 'הוספת' : 'עריכת'} כפתור דיווח מהיר</h4>
              <button onClick={() => {
                setDraft(null);
                setIsAdding(false);
              }} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 mr-1">אמוג\'י (אוטומטי)</label>
                  <div className="w-full border border-slate-100 bg-slate-50 rounded-xl p-3 text-2xl text-center">
                    {draft.emoji}
                  </div>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                    <MessageSquare size={14} />
                    תיאור הדיווח (Summary / Label)
                  </label>
                  <input
                    type="text"
                    value={draft.summary}
                    onChange={(e) => updateDraft({ summary: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                    placeholder="למשל: פסולת בגינה, מעלית תקועה, נורה שרופה..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                    <Tag size={14} />
                    קטגוריה
                  </label>
                  <select
                    value={draft.category}
                    onChange={(e) => updateDraft({ category: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  >
                    <option value="">בחר קטגוריה</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                    <AlertCircle size={14} />
                    דחיפות ברירת מחדל
                  </label>
                  <select
                    value={draft.urgency}
                    onChange={(e) => updateDraft({ urgency: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  >
                    <option value="Low">נמוכה (Low)</option>
                    <option value="Moderate">בינונית (Moderate)</option>
                    <option value="High">גבוהה (High)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-50">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                    <MapPin size={14} />
                    מיקום
                  </label>
                  <select
                    value={draft.location}
                    onChange={(e) => updateDraft({ location: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  >
                    <option value="">בחר מיקום</option>
                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                    תת-מיקום
                  </label>
                  <select
                    value={draft.subLocation}
                    onChange={(e) => updateDraft({ subLocation: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  >
                    <option value="">בחר תת-מיקום</option>
                    {subLocations.map(sl => <option key={sl} value={sl}>{sl}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={handleApplyDraft}
                disabled={!isDraftValid}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-900/10 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                סיום ושמירה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
