import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  dir?: 'rtl' | 'ltr';
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  placeholder,
  label,
  disabled = false,
  className = '',
  dir = 'rtl',
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll when modal sheet is open on mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
  };

  // Search logic: Only filter when 3 or more characters are entered
  const isSearching = searchTerm.trim().length >= 3;
  const filteredOptions = isSearching
    ? options.filter((option) =>
        option.toLowerCase().includes(searchTerm.trim().toLowerCase())
      )
    : options;

  const displayOptionText = (item: string) => {
    if (item.startsWith('-') || !isNaN(Number(item))) {
      return `\u200E${item}`;
    }
    return item;
  };

  return (
    <div className="w-full" dir={dir}>
      {/* Dropdown Header Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-sm text-right transition-all outline-none min-h-[44px] ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'
        } ${className}`}
      >
        <span className={`text-right whitespace-normal break-words leading-snug ${!value ? 'text-slate-400 font-medium' : ''}`}>
          {value ? displayOptionText(value) : placeholder}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 me-1">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="text-slate-400 hover:text-red-500 p-1 rounded-full transition-colors"
              title="נקה בחירה"
              aria-label="Clear selection"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown
            size={16}
            className={`transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-blue-600' : 'text-slate-400'
            }`}
          />
        </div>
      </button>

      {/* Fixed Modal Overlay (Top-Anchored & Keyboard Friendly) */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-start items-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white w-full max-w-lg h-[75vh] max-h-[75vh] sm:h-[70vh] sm:max-h-[70vh] rounded-b-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-200"
            onClick={(e) => e.stopPropagation()}
            dir={dir}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-base font-black text-blue-900">
                {label || placeholder}
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-full transition-colors active:scale-95"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Sticky Search Input Bar */}
            <div className="p-4 border-b border-slate-100 bg-white">
              <div className="relative flex items-center">
                <Search size={18} className="absolute right-3.5 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('search_placeholder') || 'חיפוש...'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-10 py-3 text-base font-bold text-blue-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  dir={dir}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      searchInputRef.current?.focus();
                    }}
                    className="absolute left-3 p-1 text-slate-400 hover:text-slate-600 rounded-full"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              {searchTerm.length > 0 && searchTerm.trim().length < 3 && (
                <span className="text-xs font-semibold text-slate-400 block mt-1.5 px-1">
                  הקלד לפחות 3 תווים לסינון
                </span>
              )}
            </div>

            {/* Options List with Full Text Line Wrapping */}
            <div className="flex-1 overflow-y-auto p-2 divide-y divide-slate-100">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => {
                  const isSelected = value === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleSelect(option)}
                      className={`w-full flex items-center justify-between p-3.5 text-base font-bold rounded-xl text-right transition-colors ${
                        isSelected
                          ? 'bg-blue-50 text-blue-700 font-extrabold'
                          : 'text-slate-800 hover:bg-slate-50 active:bg-slate-100'
                      }`}
                    >
                      <span className="text-right whitespace-normal break-words leading-relaxed me-2">
                        {displayOptionText(option)}
                      </span>
                      {isSelected && <Check size={18} className="text-blue-600 shrink-0 ms-2" />}
                    </button>
                  );
                })
              ) : (
                <div className="py-8 text-center text-sm font-bold text-slate-400">
                  {t('no_results') || 'לא נמצאו תוצאות'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
