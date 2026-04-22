import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Play, Pause } from 'lucide-react';

interface VoiceRecorderProps {
  onRecordingComplete: (base64: string) => void;
  onDelete: () => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onRecordingComplete, onDelete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const isStoppingRef = useRef(false);
  const isStartingRef = useRef(false);

  const MAX_DURATION = 10;

  const startRecording = async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    isStoppingRef.current = false;
    
    try {
      console.log("[AudioCapture] Initializing stream...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // If user released before stream was ready
      if (isStoppingRef.current) {
        console.log("[AudioCapture] Stop requested during init. Aborting.");
        stream.getTracks().forEach(track => track.stop());
        isStartingRef.current = false;
        return;
      }

      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
      const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
      
      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType,
        audioBitsPerSecond: 128000
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        console.log(`[AudioCapture] Finalized blob size: ${Math.round(audioBlob.size / 1024)}KB, type: ${mimeType}`);
        
        if (audioBlob.size < 100) {
          console.warn("[AudioCapture] Blob too small. Likely silent or failed.");
        }
        
        if (audioBlob.size > 0) {
          const url = URL.createObjectURL(audioBlob);
          setAudioURL(url);

          const readerBase64 = new FileReader();
          readerBase64.readAsDataURL(audioBlob);
          readerBase64.onloadend = () => {
            const base64 = (readerBase64.result as string).split(',')[1];
            onRecordingComplete(base64);
          };
        }

        stream.getTracks().forEach(track => track.stop());
        isStartingRef.current = false;
      };

      mediaRecorder.start();
      console.log("[AudioCapture] Recording started.");
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev >= MAX_DURATION - 1) {
            stopRecording();
            return MAX_DURATION;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      console.error("Microphone permission denied or error:", err);
      alert("נא לאפשר גישה למיקרופון כדי להקליט.");
      setIsExpanded(false);
      isStartingRef.current = false;
    }
  };

  const stopRecording = () => {
    console.log("[AudioCapture] Stop requested.");
    isStoppingRef.current = true;
    
    // Give a tiny window for audio data to flush if it just started
    setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        console.log("[AudioCapture] MediaRecorder stopped.");
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
    }, 200);
  };

  const handleDelete = () => {
    if (audioURL) URL.revokeObjectURL(audioURL);
    setAudioURL(null);
    setDuration(0);
    setIsPlaying(false);
    onDelete();
  };

  const togglePlayback = () => {
    if (!audioPlayerRef.current) return;
    if (isPlaying) {
      audioPlayerRef.current.pause();
    } else {
      audioPlayerRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioURL) URL.revokeObjectURL(audioURL);
    };
  }, []);

  // CLOSED STATE: Just the trigger button
  if (!isExpanded && !audioURL) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center hover:bg-blue-100 transition-all active:scale-90 shadow-sm border border-blue-100"
        title="הקלט הודעה קולית"
      >
        <Mic size={20} />
      </button>
    );
  }

  // CLOSED STATE: Just the trigger button OR the compact pill if audio exists
  if (!isExpanded) {
    return (
      <div className="flex items-center gap-2">
        {audioURL ? (
          <div className="flex items-center gap-2 bg-blue-600 text-white pl-1 pr-3 py-1 rounded-full shadow-md animate-in slide-in-from-right-2 duration-300">
            <button
              onClick={togglePlayback}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-blue-700 transition-all active:scale-90"
              title={isPlaying ? "הפסק" : "נגן"}
            >
              {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
            </button>
            <div className="w-12 h-1 bg-blue-400/50 rounded-full overflow-hidden mr-1">
              <div className="h-full bg-white w-full" />
            </div>
            <button
              onClick={handleDelete}
              className="text-blue-100 hover:text-white p-1.5 transition-colors"
              title="מחק"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ) : null}
        
        <button
          onClick={() => setIsExpanded(true)}
          className={`
            w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-sm border
            ${audioURL 
              ? 'bg-blue-50 text-blue-600 border-blue-100' 
              : 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
            }
          `}
          title={audioURL ? "הקלט שוב" : "הקלט הודעה קולית"}
        >
          <Mic size={20} />
        </button>
      </div>
    );
  }

  // OPEN STATE: Pop-up overlay for the recording process
  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] animate-in slide-in-from-bottom-2 duration-300 px-4 pb-8 pointer-events-none">
      <div className="bg-white/95 backdrop-blur-md p-6 rounded-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.15)] border border-slate-100 max-w-sm mx-auto pointer-events-auto">
        <div className="flex items-center justify-between mb-6">
          <span className="text-[10px] font-black text-blue-900/40 uppercase tracking-widest">
            {isRecording ? 'מקליט כרגע...' : 'הקלטת קול'}
          </span>
          {!isRecording && (
            <button onClick={() => setIsExpanded(false)} className="text-slate-400 p-1 hover:text-slate-600 transition-colors">
              <Square size={20} className="rotate-45" />
            </button>
          )}
        </div>

        <div className="flex flex-col items-center gap-6 py-2">
          <div className="relative">
            {isRecording && (
              <div className="absolute inset-0 bg-red-100 rounded-full animate-ping opacity-25" />
            )}
            <button
              onClick={() => isRecording ? stopRecording() : startRecording()}
              className={`
                relative w-24 h-24 rounded-full flex flex-col items-center justify-center gap-1
                transition-all duration-200 shadow-2xl z-10
                ${isRecording 
                  ? 'bg-red-500 text-white scale-110' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
                }
              `}
            >
              {isRecording ? <Square size={32} fill="currentColor" /> : <Mic size={32} />}
              {isRecording && <span className="text-xs font-black">{duration}s</span>}
            </button>
          </div>
          
          <div className="text-center">
            <p className="text-base font-bold text-slate-800 mb-1">
              {isRecording ? 'לחץ לסיום ההקלטה' : 'לחץ על המיקרופון להקלטה'}
            </p>
            <p className="text-[11px] font-medium text-slate-400">
              {isRecording ? 'ההודעה תישמר אוטומטית' : 'ניתן להקליט עד 10 שניות'}
            </p>
          </div>

          {isRecording && (
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-red-500 transition-all duration-1000 ease-linear"
                style={{ width: `${(duration / MAX_DURATION) * 100}%` }}
              />
            </div>
          )}
        </div>
        <audio ref={audioPlayerRef} src={audioURL || ''} onEnded={() => setIsPlaying(false)} className="hidden" />
      </div>
    </div>
  );
};
