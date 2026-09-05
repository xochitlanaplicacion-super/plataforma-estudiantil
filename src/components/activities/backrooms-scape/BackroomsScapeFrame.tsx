'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { backroomsScapeGameActivity } from '@/lib/activities/backrooms-scape';
import type { GameLeaderboard } from '@/lib/game-leaderboard';

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

export function BackroomsScapeFrame({ exercise, leaderboard, onComplete, onClose, className = '' }: {
  exercise: any;
  leaderboard?: GameLeaderboard | null;
  onComplete?: (result: BackroomsScapeResult) => Promise<GameLeaderboard | null | undefined> | GameLeaderboard | null | undefined;
  onClose?: () => void;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activity = useMemo(() => backroomsScapeGameActivity(exercise), [exercise]);
  const sendActivity = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'backrooms-scape:load',
      payload: { activity, leaderboard },
    }, window.location.origin);
  }, [activity, leaderboard]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === 'backrooms-scape:ready') sendActivity();
      if (event.data?.type === 'backrooms-scape:complete' && onComplete) {
        void Promise.resolve(onComplete(event.data.payload as BackroomsScapeResult)).then((updated) => {
          if (updated) iframeRef.current?.contentWindow?.postMessage({ type: 'backrooms-scape:leaderboard', payload: updated }, window.location.origin);
        });
      }
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
