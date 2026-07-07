import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus, SortAsc, Hash } from 'lucide-react';

interface ListEditorProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  allowRanges?: boolean;
  hideSortButton?: boolean;
  showNumericSort?: boolean;
  placeholder?: string;
  helperText?: string;
  isLtr?: boolean;
}

export const ListEditor: React.FC<ListEditorProps> = ({
  label,
  items,
  onChange,
  allowRanges = false,
  hideSortButton = false,
  showNumericSort = false,
  placeholder = 'Add new value...',
  helperText,
  isLtr = false
}) => {
  const [inputValue, setInputValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const expandRange = (str: string): string[] | null => {
    // Match: optional leading minus, digits, a dash separator, optional minus, digits
    // e.g. "-2-5" (from -2 to 5), "1-5" (from 1 to 5), "-5--1" (from -5 to -1)
    const match = str.trim().match(/^(-?\d+)-(-?\d+)$/);
    if (!match) return null;
    
    const start = parseInt(match[1]);
    const end = parseInt(match[2]);
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    
    const result: string[] = [];
    for (let i = min; i <= max; i++) {
        result.push(i.toString());
    }
    return result;
  };

  const handleDoubleClick = (item: string, idx: number) => {
    setInputValue(item);
    setEditingIndex(idx);
  };

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (editingIndex !== null) {
      const newItems = [...items];
      // Check if it already exists elsewhere in the list to avoid duplicate entries
      const dupIndex = newItems.indexOf(trimmed);
      if (dupIndex !== -1 && dupIndex !== editingIndex) {
        setInputValue('');
        setEditingIndex(null);
        return;
      }

      newItems[editingIndex] = trimmed;

      if (allowRanges) {
        newItems.sort((a, b) => {
          const numA = parseInt(a);
          const numB = parseInt(b);
          if (isNaN(numA) || isNaN(numB)) return a.localeCompare(b, 'he');
          return numA - numB;
        });
      }

      onChange(newItems);
      setInputValue('');
      setEditingIndex(null);
      
      const newIndex = allowRanges ? newItems.indexOf(trimmed) : editingIndex;
      setSelectedIndex(newIndex !== -1 ? newIndex : null);
    } else {
      let valuesToAdd: string[] = [trimmed];

      if (allowRanges) {
        const expanded = expandRange(trimmed);
        if (expanded) {
          valuesToAdd = expanded;
        }
      }

      const newItems = [...items];
      let addedCount = 0;

      valuesToAdd.forEach(val => {
        if (!newItems.includes(val)) {
          newItems.push(val);
          addedCount++;
        }
      });

      if (addedCount > 0) {
        if (allowRanges) {
          newItems.sort((a, b) => {
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (isNaN(numA) || isNaN(numB)) return a.localeCompare(b, 'he');
            return numA - numB;
          });
        }
        onChange(newItems);
        setInputValue('');
        setSelectedIndex(null);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Escape') {
      setInputValue('');
      setEditingIndex(null);
    }
  };

  const handleDelete = () => {
    if (selectedIndex === null) return;
    const newItems = items.filter((_, i) => i !== selectedIndex);
    onChange(newItems);
    setSelectedIndex(null);
    setInputValue('');
    setEditingIndex(null);
  };

  const handleMove = (direction: 'up' | 'down') => {
    if (selectedIndex === null) return;
    const newIndex = direction === 'up' ? selectedIndex - 1 : selectedIndex + 1;
    
    if (newIndex < 0 || newIndex >= items.length) return;

    const newItems = [...items];
    const temp = newItems[selectedIndex];
    newItems[selectedIndex] = newItems[newIndex];
    newItems[newIndex] = temp;

    onChange(newItems);
    setSelectedIndex(newIndex);
    setEditingIndex(null);
    setInputValue('');
  };

  const handleAlphabeticalSort = () => {
    const sorted = [...items].sort((a, b) => a.localeCompare(b, 'he'));
    onChange(sorted);
    setSelectedIndex(null);
    setEditingIndex(null);
    setInputValue('');
  };

  const handleNumericSort = () => {
    const sorted = [...items].sort((a, b) => {
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (isNaN(numA) || isNaN(numB)) return a.localeCompare(b, 'he');
      return numA - numB;
    });
    onChange(sorted);
    setSelectedIndex(null);
    setEditingIndex(null);
    setInputValue('');
  };

  return (
    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-sm transition-all hover:border-slate-300 overflow-hidden">
      <div className="flex justify-between items-center mb-3">
        <label className="block font-bold text-slate-700 text-sm uppercase tracking-wider">{label}</label>
        <div className="flex gap-2">
          {items.length > 1 && showNumericSort && (
            <button 
              type="button"
              onClick={handleNumericSort}
              className="flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-2 py-1 rounded shadow-sm transition-all"
              title="Sort numerically"
            >
              <Hash size={12} />
              1-9
            </button>
          )}
          {items.length > 1 && !hideSortButton && (
            <button 
              type="button"
              onClick={handleAlphabeticalSort}
              className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-white border border-blue-100 hover:bg-blue-50 px-2 py-1 rounded shadow-sm transition-all"
              title="Sort alphabetically"
            >
              <SortAsc size={12} />
              A-Z
            </button>
          )}
        </div>
      </div>
      
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-start">
        {/* Left: Scrollable List (Simulating read-only textarea) */}
        <select
          size={8}
          className="w-full lg:w-48 border border-slate-300 rounded-lg p-2 bg-white outline-none focus:ring-2 focus:ring-blue-100 font-bold text-slate-900 overflow-y-auto min-h-[150px] text-right"
          dir="rtl"
          value={selectedIndex !== null ? selectedIndex : ''}
          onChange={(e) => {
            setSelectedIndex(parseInt(e.target.value));
            setEditingIndex(null);
            setInputValue('');
          }}
          onFocus={() => { if (selectedIndex === null && items.length > 0) setSelectedIndex(0); }}
          onDoubleClick={() => {
            if (selectedIndex !== null && items[selectedIndex] !== undefined) {
              handleDoubleClick(items[selectedIndex], selectedIndex);
            }
          }}
        >
          {items.map((item, idx) => (
            <option 
              key={`${item}-${idx}`} 
              value={idx} 
              className="p-1 px-2 rounded cursor-pointer hover:bg-blue-50 text-slate-900 font-bold"
              onDoubleClick={() => handleDoubleClick(item, idx)}
            >
              {isLtr && item.startsWith('-') ? `\u200E${item}` : item}
            </option>
          ))}
          {items.length === 0 && <option disabled className="text-slate-400 italic font-normal">No values added</option>}
        </select>

        {/* Right: Controls */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="flex gap-2 w-full">
            <input
              type="text"
              className={`flex-1 min-w-0 border ${editingIndex !== null ? 'border-amber-400 focus:ring-amber-100 bg-amber-50/10 font-bold' : 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'} rounded-lg px-3 py-2 outline-none transition-all text-slate-900 bg-white text-sm ${isLtr ? 'text-left' : 'text-right'}`}
              dir={isLtr ? 'ltr' : 'rtl'}
              placeholder={placeholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!inputValue.trim()}
              className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-colors shadow-sm disabled:opacity-50"
              title={editingIndex !== null ? "שמור עריכה (Enter / Escape לביטול)" : "הוסף לרשימה"}
            >
              <Plus size={20} />
            </button>
          </div>

          <div className="flex items-center justify-between mt-1 w-full">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleMove('up')}
                disabled={selectedIndex === null || selectedIndex === 0}
                className="p-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-30 transition-all text-slate-800 shadow-sm"
                title="Move up"
              >
                <ArrowUp size={18} />
              </button>
              <button
                type="button"
                onClick={() => handleMove('down')}
                disabled={selectedIndex === null || selectedIndex === items.length - 1}
                className="p-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-30 transition-all text-slate-800 shadow-sm"
                title="Move down"
              >
                <ArrowDown size={18} />
              </button>
            </div>
            
            <button
              type="button"
              onClick={handleDelete}
              disabled={selectedIndex === null}
              className="p-2 border border-red-200 text-red-600 rounded-lg bg-red-50 hover:bg-red-100 disabled:opacity-30 transition-all flex items-center gap-1 text-xs font-bold shadow-sm"
              title="Delete selected"
            >
              <Trash2 size={18} />
            </button>
          </div>
          
          {helperText && <p className="text-[10px] text-slate-700 mt-2 italic leading-relaxed font-bold border-t border-slate-100 pt-2">{helperText}</p>}
        </div>
      </div>
    </div>
  );
};
