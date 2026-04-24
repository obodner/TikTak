'use client';

import React, { useRef } from 'react';
import { Camera, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CameraTriggerProps {
  onCapture: (file: File) => void;
  onManualReport: () => void;
  isLoading?: boolean;
}

export const CameraTrigger: React.FC<CameraTriggerProps> = ({ 
  onCapture, 
  onManualReport,
  isLoading
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
    <div className="flex flex-col items-center gap-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-700 pb-4">
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
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          {isLoading && <div className="ring-container" />}
          <button
            onClick={() => handleActionClick('camera')}
            disabled={isLoading}
            className={`
              w-48 h-48 rounded-full text-white cta-circle cta-red
              flex items-center justify-center relative group
              ${isLoading ? 'opacity-80 pointer-events-none' : 'cursor-pointer animate-cta-pulse'}
            `}
          >
            <Camera size={64} className="drop-shadow-lg group-hover:scale-110 transition-transform" />
          </button>
        </div>
        <div className="text-center">
          <span className="block font-black text-2xl text-slate-800 mb-1">
            {t('snap_and_send')}
          </span>
          <p className="text-slate-400 font-bold text-sm uppercase tracking-wider">
            {t('ai_tagline')}
          </p>
        </div>
      </div>

      {/* Blue Circle: Manual Report */}
      <div className="flex flex-col items-center gap-4">
        <button
          onClick={() => handleActionClick('manual')}
          disabled={isLoading}
          className="w-24 h-24 rounded-full text-white cta-circle cta-blue flex items-center justify-center group"
        >
          <Wrench size={32} className="group-hover:rotate-12 transition-transform" />
        </button>
        <button 
          onClick={() => handleActionClick('manual')}
          className="text-slate-500 font-black text-lg hover:text-blue-600 transition-colors"
        >
          {t('describe_briefly')}
        </button>
      </div>
    </div>
  );
};

