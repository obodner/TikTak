'use client';

import React, { useRef } from 'react';
import { Camera, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CameraTriggerProps {
  onCapture: (file: File) => void;
  onManualReport: () => void;
  isLoading?: boolean;
  middleContent?: React.ReactNode;
}

export const CameraTrigger: React.FC<CameraTriggerProps> = ({ 
  onCapture, 
  onManualReport,
  isLoading,
  middleContent
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleActionClick = (action: 'camera' | 'manual') => {
    if (action === 'camera') {
      inputRef.current?.click();
    } else {
      onManualReport();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture(file);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-evenly w-full animate-in fade-in slide-in-from-bottom-2 duration-500 py-1 gap-1 sm:gap-2">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        ref={inputRef}
        onChange={handleChange}
        disabled={isLoading}
      />
      
      {/* Red Circle: Snap & Send Now */}
      <div className="flex flex-col items-center gap-1 sm:gap-2 shrink-0">
        <div className="relative">
          {isLoading && <div className="ring-container" />}
          <button
            onClick={() => handleActionClick('camera')}
            disabled={isLoading}
            className={`
              w-36 h-36 xs:w-44 xs:h-44 sm:w-56 sm:h-56 rounded-full text-white cta-circle cta-red
              flex items-center justify-center relative group shadow-xl
              ${isLoading ? 'opacity-80 pointer-events-none' : 'cursor-pointer animate-cta-pulse'}
            `}
          >
            <Camera className="w-12 h-12 xs:w-14 xs:h-14 sm:w-16 sm:h-16 drop-shadow-lg group-hover:scale-110 transition-transform" />
          </button>
        </div>
        <div className="text-center mt-1">
          <span className="block font-black text-xl xs:text-2xl sm:text-3xl text-slate-950 tracking-tight leading-tight">
            {t('snap_and_send')}
          </span>
          <p className="text-slate-700 font-extrabold text-xs xs:text-sm sm:text-base tracking-normal mt-0.5">
            {t('ai_tagline')}
          </p>
        </div>
      </div>

      {middleContent && (
        <div className="w-full shrink-0 my-0.5">
          {middleContent}
        </div>
      )}

      {/* Blue Circle: Manual Report */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <button
          onClick={() => handleActionClick('manual')}
          disabled={isLoading}
          className="w-12 h-12 sm:w-16 sm:h-16 rounded-full text-white cta-circle cta-blue flex items-center justify-center group shadow-md"
        >
          <Wrench className="w-5 h-5 sm:w-7 sm:h-7 group-hover:rotate-12 transition-transform" />
        </button>
        <button 
          onClick={() => handleActionClick('manual')}
          className="text-slate-800 font-black text-xs sm:text-base hover:text-blue-600 transition-colors"
        >
          {t('describe_briefly')}
        </button>
      </div>
    </div>
  );
};

