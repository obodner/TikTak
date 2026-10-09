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
    <div className="flex-1 flex flex-col items-center justify-evenly w-full animate-in fade-in slide-in-from-bottom-2 duration-500 py-1">
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
      <div className="flex flex-col items-center gap-2 sm:gap-3">
        <div className="relative">
          {isLoading && <div className="ring-container" />}
          <button
            onClick={() => handleActionClick('camera')}
            disabled={isLoading}
            className={`
              w-56 h-56 sm:w-64 sm:h-64 rounded-full text-white cta-circle cta-red
              flex items-center justify-center relative group shadow-2xl
              ${isLoading ? 'opacity-80 pointer-events-none' : 'cursor-pointer animate-cta-pulse'}
            `}
          >
            <Camera size={76} className="drop-shadow-lg group-hover:scale-110 transition-transform" />
          </button>
        </div>
        <div className="text-center mt-1 sm:mt-1.5">
          <span className="block font-black text-3xl sm:text-4xl text-slate-950 tracking-tight">
            {t('snap_and_send')}
          </span>
          <p className="text-slate-700 font-extrabold text-lg sm:text-xl tracking-normal mt-1">
            {t('ai_tagline')}
          </p>
        </div>
      </div>

      {middleContent && (
        <div className="w-full shrink-0">
          {middleContent}
        </div>
      )}

      {/* Blue Circle: Manual Report */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => handleActionClick('manual')}
          disabled={isLoading}
          className="w-20 h-20 sm:w-24 sm:h-24 rounded-full text-white cta-circle cta-blue flex items-center justify-center group shadow-md"
        >
          <Wrench size={34} className="group-hover:rotate-12 transition-transform" />
        </button>
        <button 
          onClick={() => handleActionClick('manual')}
          className="text-slate-800 font-black text-lg sm:text-xl hover:text-blue-600 transition-colors mt-0.5"
        >
          {t('describe_briefly')}
        </button>
      </div>
    </div>
  );
};

