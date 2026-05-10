import React, { useRef, useState, useEffect } from 'react';
import { QuickTapItem } from './admin/QuickTapEditor';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface QuickTapPillsProps {
  items: QuickTapItem[];
  onSelect: (item: QuickTapItem) => void;
  title?: string;
}

export const QuickTapPills: React.FC<QuickTapPillsProps> = ({
  items,
  onSelect,
  title = "דיווח מהיר"
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  // Sort items by emoji as requested
  const sortedItems = [...items].sort((a, b) => (a.emoji || '').localeCompare(b.emoji || ''));

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    
    // In RTL, scrollLeft is 0 at the start (rightmost) and decreases (becomes negative) as we scroll left.
    // Or it might be positive depending on the browser. 
    // Standard approach:
    const isRTL = document.dir === 'rtl';
    
    if (isRTL) {
      // For RTL: scrollLeft is 0 when all the way to the right
      // As we scroll left, scrollLeft becomes more negative.
      setShowRightFade(scrollLeft < 0);
      setShowLeftFade(Math.abs(scrollLeft) + clientWidth < scrollWidth - 1);
    } else {
      setShowLeftFade(scrollLeft > 0);
      setShowRightFade(scrollLeft + clientWidth < scrollWidth - 1);
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      checkScroll();
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="w-full space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-blue-900/60 text-xs font-black uppercase tracking-widest">{title}</h3>
      </div>
      
      <div className="relative group">
        {/* Left Fade */}
        <div 
          className={cn(
            "absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none transition-opacity duration-300",
            showLeftFade ? "opacity-100" : "opacity-0"
          )} 
        />
        
        {/* Right Fade */}
        <div 
          className={cn(
            "absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none transition-opacity duration-300",
            showRightFade ? "opacity-100" : "opacity-0"
          )} 
        />

        <div 
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 px-1 snap-x"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {sortedItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className="flex-shrink-0 flex items-center gap-3 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 px-5 py-3 rounded-2xl shadow-sm active:scale-95 transition-all snap-start"
            >
              <span className="text-2xl shrink-0">{item.emoji}</span>
              <div className="flex flex-col items-start text-right">
                <span className="text-sm font-black text-slate-900 leading-tight whitespace-nowrap">
                  {item.summary}
                </span>
                {(item.location || item.subLocation) && (
                  <span className="text-[10px] font-bold text-slate-500 leading-tight mt-0.5">
                    {[item.location, item.subLocation].filter(Boolean).join(' • ')}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
