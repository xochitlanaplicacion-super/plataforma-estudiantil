'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { backroomsScapeGameActivity } from '@/lib/activities/backrooms-scape';

export interface BackroomsScapeResult {
  hits: number;
  total: number;
  wrongAttempts: number;
  time: number;
  captures: number;
  score: number;
  seedCode: string;
  fragments: number;
}

export function BackroomsScapeFrame({ exercise, onComplete, onClose, className = '' }: {
  exercise: any;
  onComplete?: (result: BackroomsScapeResult) => void;
  onClose?: () => void;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activity = useMemo(() => backroomsScapeGameActivity(exercise), [exercise]);
  const sendActivity = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'backrooms-scape:load', payload: { activity },
    }, window.location.origin);
  }, [activity]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === 'backrooms-scape:ready') sendActivity();
      if (event.data?.type === 'backrooms-scape:complete') onComplete?.(event.data.payload as BackroomsScapeResult);
      if (event.data?.type === 'backrooms-scape:close') onClose?.();
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onClose, onComplete, sendActivity]);

  return <iframe ref={iframeRef} src="/games/backrooms-scape/index.html?embed=1"
    title={`Backrooms Scape: ${exercise?.titulo || 'Actividad'}`}
    className={`h-full w-full border-0 bg-[#101416] ${className}`} onLoad={sendActivity}
    allow="fullscreen; gamepad" sandbox="allow-scripts allow-same-origin allow-pointer-lock" />;
}
