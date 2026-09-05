'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { parkourRaceGameActivity } from '@/lib/activities/parkour-race';
import type { GameLeaderboard } from '@/lib/game-leaderboard';

export interface ParkourRaceResult {
  hits: number;
  total: number;
  wrongAttempts: number;
  time: number;
  falls: number;
  score: number;
  seedCode: string;
}

export function ParkourRaceFrame({
  exercise,
  leaderboard,
  onComplete,
  onClose,
  className = '',
}: {
  exercise: any;
  leaderboard?: GameLeaderboard | null;
  onComplete?: (result: ParkourRaceResult) => Promise<GameLeaderboard | null | undefined> | GameLeaderboard | null | undefined;
  onClose?: () => void;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activity = useMemo(() => parkourRaceGameActivity(exercise), [exercise]);

  const sendActivity = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'parkour-race:load',
      payload: { activity, leaderboard },
    }, window.location.origin);
  }, [activity, leaderboard]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === 'parkour-race:ready') sendActivity();
      if (event.data?.type === 'parkour-race:complete' && onComplete) {
        void Promise.resolve(onComplete(event.data.payload as ParkourRaceResult)).then((updated) => {
          if (updated) iframeRef.current?.contentWindow?.postMessage({ type: 'parkour-race:leaderboard', payload: updated }, window.location.origin);
        });
      }
      if (event.data?.type === 'parkour-race:close' && onClose) onClose();
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onClose, onComplete, sendActivity]);

  return (
    <iframe
      ref={iframeRef}
      src="/games/parkour-race/index.html?embed=1"
      title={`Parkour Race: ${exercise?.titulo || 'Actividad'}`}
      className={`h-full w-full border-0 bg-[#0B1026] ${className}`}
      onLoad={sendActivity}
      allow="fullscreen; gamepad"
      sandbox="allow-scripts allow-same-origin allow-pointer-lock"
    />
  );
}
