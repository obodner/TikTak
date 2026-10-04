import React, { useRef, useState, useEffect } from 'react';
import { X, RotateCcw, Check, PenTool } from 'lucide-react';

interface SignaturePadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (signatureDataUrl: string, signerName: string, extraData?: { signerPhone?: string; companyId?: string }) => void;
  title: string;
  subtitle?: string;
  defaultSignerName?: string;
  defaultSignerPhone?: string;
  requireCompanyId?: boolean; // For contractor: ח.פ. / עוסק מורשה / ת.ז.
  requireConsentCheckbox?: boolean;
  consentCheckboxText?: string;
}

export default function SignaturePadModal({
  isOpen,
  onClose,
  onSave,
  title,
  subtitle,
  defaultSignerName = '',
  defaultSignerPhone = '',
  requireCompanyId = false,
  requireConsentCheckbox = false,
  consentCheckboxText = 'אני מאשר כי קראתי את כל סעיפי ההסכם ותנאיו, וחתימתי זו מהווה התחייבות משפטית מלאה ומחייבת לפי חוק חתימה אלקטרונית, התשס"א-2001.'
}: SignaturePadModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [signerPhone, setSignerPhone] = useState(defaultSignerPhone);
  const [companyId, setCompanyId] = useState('');
  const [hasConsented, setHasConsented] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Update defaults when modal opens
  useEffect(() => {
    if (isOpen) {
      setSignerName(defaultSignerName);
      setSignerPhone(defaultSignerPhone);
      setCompanyId('');
      setHasConsented(false);
      setErrorMsg('');
      setHasDrawn(false);
      setIsDrawing(false);
      // Setup canvas on next tick
      setTimeout(() => {
        initCanvas();
      }, 50);
    }
  }, [isOpen, defaultSignerName, defaultSignerPhone, requireConsentCheckbox]);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a'; // slate-900
      ctx.lineWidth = 2.5;
    }
  };

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    } else if ('clientX' in e) {
      return {
        x: (e as React.MouseEvent).clientX - rect.left,
        y: (e as React.MouseEvent).clientY - rect.top
      };
    }
    return { x: 0, y: 0 };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if ('touches' in e) {
      // Prevent scrolling on touch devices while signing
      e.stopPropagation();
    }
    const coords = getCoordinates(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsDrawing(true);
    setHasDrawn(true);
    setErrorMsg('');
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    if ('touches' in e) {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    }
    const coords = getCoordinates(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.closePath();
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setErrorMsg('');
  };

  const handleConfirm = () => {
    if (!signerName.trim()) {
      setErrorMsg('יש להזין שם מלא לחותם.');
      return;
    }
    if (requireCompanyId && !companyId.trim()) {
      setErrorMsg('יש להזין מספר ח.פ. / עוסק מורשה / ת.ז. של הקבלן.');
      return;
    }
    if (!hasDrawn) {
      setErrorMsg('יש לצייר את חתימתך על גבי המשטח.');
      return;
    }
    if (requireConsentCheckbox && !hasConsented) {
      setErrorMsg('יש לאשר את הצהרת ההסכם המשפטית.');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Export signature as transparent PNG
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl, signerName.trim(), {
      signerPhone: signerPhone.trim() || undefined,
      companyId: companyId.trim() || undefined
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto no-print">
      <div 
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
        dir="rtl"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <PenTool size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">{title}</h3>
              {subtitle && <p className="text-xs text-slate-500 font-medium">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/80 hover:bg-white text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer border border-slate-200"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-bold flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                שם החותם המורשה <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                placeholder="לדוגמה: ישראל ישראלי"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
              />
            </div>

            {requireCompanyId ? (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  ח.פ. / עוסק מורשה / ת.ז. <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={companyId}
                  onChange={e => setCompanyId(e.target.value)}
                  placeholder="מספר מזהה חוקי"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  טלפון איש קשר
                </label>
                <input
                  type="tel"
                  value={signerPhone}
                  onChange={e => setSignerPhone(e.target.value)}
                  placeholder="05X-XXXXXXX"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900"
                />
              </div>
            )}
          </div>

          {/* Signature Canvas Area */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                <span>משטח חתימה דיגיטלי</span>
                <span className="text-slate-400 font-normal">(חתום באמצעות האצבע או עט סטיילוס)</span>
              </label>
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <RotateCcw size={11} />
                <span>נקה</span>
              </button>
            </div>

            <div className="relative border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-colors overflow-hidden touch-none">
              <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full h-40 cursor-crosshair block"
              />
              {!hasDrawn && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-slate-400 gap-1">
                  <PenTool size={22} className="opacity-40" />
                  <span className="text-xs font-medium">חתום כאן</span>
                </div>
              )}
              <div className="absolute bottom-2 left-3 text-[10px] text-slate-400 pointer-events-none select-none">
                TikTak Secure Canvas Signature
              </div>
            </div>
          </div>

          {/* Legal Consent Checkbox */}
          {requireConsentCheckbox && (
            <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasConsented}
                  onChange={e => setHasConsented(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-[11px] leading-relaxed text-slate-700 font-medium">
                  {consentCheckboxText}
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2.5 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Check size={14} />
            <span>אשר והטבע חתימה</span>
          </button>
        </div>
      </div>
    </div>
  );
}
