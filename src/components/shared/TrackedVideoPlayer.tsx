'use client';

import React, { useRef, useState, useEffect } from 'react';
import YouTube, { YouTubeProps } from 'react-youtube';
import { saveVideoProgress } from '@/lib/actions/alumno';

interface TrackedVideoPlayerProps {
  videoId: string;
  videoUrl: string;
  temaId: string;
  initialProgressSeconds?: number;
  onClose?: () => void;
}

export default function TrackedVideoPlayer({ 
  videoId, 
  videoUrl, 
  temaId, 
  initialProgressSeconds = 0,
  onClose 
}: TrackedVideoPlayerProps) {
  const playerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  const syncProgress = async (completed: boolean = false) => {
    if (!playerRef.current) return;
    try {
      const currentTime = await playerRef.current.getCurrentTime();
      const duration = await playerRef.current.getDuration();
      
      // Consider completed if within 5% of the end
      const isCompleted = completed || (duration > 0 && currentTime >= duration * 0.95);
      
      await saveVideoProgress(temaId, videoUrl, currentTime, duration, isCompleted);
    } catch (error) {
      console.error('Error syncing video progress', error);
    }
  };

  const onPlayerReady: YouTubeProps['onReady'] = (event) => {
    playerRef.current = event.target;
    // Seek to initial progress if any
    if (initialProgressSeconds > 0) {
      event.target.seekTo(initialProgressSeconds, true);
    }
  };

  const onPlayerStateChange: YouTubeProps['onStateChange'] = (event) => {
    // 1 = playing, 2 = paused, 0 = ended
    if (event.data === 1) {
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
      // Sync immediately on pause or end
      syncProgress(event.data === 0);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      // Sync every 10 seconds while playing
      progressInterval.current = setInterval(() => {
        syncProgress();
      }, 10000);
    } else {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    }
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [isPlaying]);

  // Sync when unmounting (e.g., closing modal)
  useEffect(() => {
    return () => {
      syncProgress();
    };
  }, []);

  const opts: YouTubeProps['opts'] = {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 1,
      modestbranding: 1,
      rel: 0,
    },
  };

  return (
    <div className="w-full h-full relative">
      <YouTube 
        videoId={videoId} 
        opts={opts} 
        onReady={onPlayerReady} 
        onStateChange={onPlayerStateChange}
        className="w-full h-full absolute top-0 left-0"
        iframeClassName="w-full h-full"
      />
    </div>
  );
}
