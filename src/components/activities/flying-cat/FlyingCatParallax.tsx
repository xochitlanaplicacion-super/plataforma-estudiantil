'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import './flying-cat-parallax.css';

export interface FlyingCatParallaxHandle {
  /** Absolute virtual flight time; the game owns progression and pause rules. */
  advance: (clockSeconds: number) => void;
}

const LAYERS = [
  { name: 'clouds', speed: 6 },
  { name: 'mountains', speed: 14 },
  { name: 'hills', speed: 27 },
  { name: 'fields', speed: 43 },
  { name: 'trees', speed: 62 },
] as const;

type LayerName = (typeof LAYERS)[number]['name'];

// Crop each composited strip to its actual artwork. Keeping five full-height
// high-DPI textures would waste memory, particularly on tablets.
const LAYER_VIEWBOX: Record<LayerName, string> = {
  clouds: '0 0 1200 192',
  mountains: '0 150 1200 450',
  hills: '0 276 1200 324',
  fields: '0 402 1200 198',
  trees: '0 522 1200 78',
};

/** Every landscape meets the next tile at the same height and slope. */
function LandscapeTile({ layer }: { layer: LayerName }) {
  return (
    <svg className="fc-parallax-tile" viewBox={LAYER_VIEWBOX[layer]} preserveAspectRatio="none" focusable="false">
      {layer === 'clouds' && (
        <g fill="#fff8e9">
          <path opacity=".52" d="M62 70c28-2 30-13 57-12 24-20 63-23 86-3 27-3 40 13 68 14 28 1 35 5 51 12-77 7-183 7-270 0 4-6 2-8 8-11Z" />
          <path opacity=".25" d="M60 81c77 2 155 6 253-1-57 17-145 17-253 1Z" />
          <path opacity=".4" d="M590 135c22-1 34-12 59-10 13-12 42-15 59-3 25-4 41 9 59 12 15 0 31 3 51 8-65 8-162 9-236 0 1-3 5-5 8-7Z" />
          <path opacity=".48" d="M948 53c23-2 37-12 62-11 18-15 51-22 77-5 21-1 41 9 56 15 21-1 37 4 45 9-64 8-165 8-254 1 3-5 8-7 14-9Z" />
          <path opacity=".19" d="M434 47c24-10 63-12 92-5 29-3 46 4 66 10-57 9-121 7-168 3Z" />
        </g>
      )}
      {layer === 'mountains' && (
        <>
          <path fill="#8bb0b9" opacity=".58" d="M0 240C64 240 80 198 145 206S253 134 322 170 407 235 471 224 548 152 622 183 714 122 786 169 885 241 953 215 1090 240 1200 240V600H0Z" />
          <path fill="#a8c3c3" opacity=".46" d="M0 254C60 254 89 218 145 218S262 154 322 183 413 247 475 237 557 176 622 194 727 148 787 182 884 253 952 229 1090 254 1200 254V600H0Z" />
          <path fill="#dce2cd" opacity=".2" d="M262 172l60 11 37 30-37-14-29-1-31-10ZM724 158l62 24 46 31-48-17-23-7-37-19Z" />
          <path fill="#b7cfcd" opacity=".27" d="M0 287c89 0 119-12 207-7s159-18 250-8 141-5 222-1 127-9 222-1 205 17 299 17V600H0Z" />
        </>
      )}
      {layer === 'hills' && (
        <>
          <path fill="#91a88c" opacity=".68" d="M0 328C93 328 100 288 189 298S291 363 391 337 467 277 555 308 663 358 752 326 870 295 956 327 1104 328 1200 328V600H0Z" />
          <path fill="#b4bb91" opacity=".68" d="M0 367C101 367 117 340 208 352S308 394 407 378 515 331 604 358 722 393 808 366 919 345 998 365 1104 367 1200 367V600H0Z" />
          <path fill="#d5d6ae" opacity=".32" d="M0 398C111 398 146 365 230 379S360 422 447 405 548 360 651 390 798 421 882 394 1066 398 1200 398V600H0Z" />
          <path fill="#fff5d5" opacity=".16" d="M80 369c84-22 132-11 226 16-89-7-153-18-226-16ZM643 369c73 29 112 25 187 1-87 11-117 8-187-1Z" />
        </>
      )}
      {layer === 'fields' && (
        <>
          <path fill="#d2cc94" opacity=".86" d="M0 449C78 449 118 420 220 432S351 479 440 459 553 411 650 438 784 480 880 457 1094 449 1200 449V600H0Z" />
          <path fill="#9cba9a" opacity=".68" d="M0 485C124 485 147 466 259 486S378 536 489 510 645 470 755 500 951 528 1049 502 1120 485 1200 485V600H0Z" />
          <path fill="#bbcdac" opacity=".9" d="M0 539C143 539 144 501 279 520S473 571 605 545 795 517 916 546 1098 539 1200 539V600H0Z" />
          <path fill="#ece1b8" opacity=".72" d="m281 457 77 8-152 84-82-10Zm68 5 11 2-152 88-10-2ZM859 480l15 3 119 61-13 1Z" />
          <g fill="none" stroke="#78977c" strokeWidth="4" opacity=".3">
            <path d="m405 463-123 76m137-75-107 82m121-84-92 91m598-56 115 49m-98-50 110 48" />
          </g>
          <g className="fc-parallax-village" opacity=".67">
            <path fill="#eae1c8" d="M750 445h20v20h-20Zm27 7h19v14h-19Zm36-2h23v19h-23Zm26 9h15v13h-15Zm-34-41h10v42h-10Z" />
            <path fill="#57767c" d="m746 445 14-9 14 9Zm28 7 12-8 13 8Zm36-2 15-10 15 10Zm26 9 12-7 10 7Zm-33-41 7-12 7 12Z" />
            <path fill="#708981" d="M758 455h5v10h-5Zm65 4h4v10h-4Zm-15-14h4v15h-4Z" />
          </g>
        </>
      )}
      {layer === 'trees' && (
        <>
          <path fill="#95b2a3" opacity=".65" d="M0 574C87 574 140 551 234 569S401 589 495 574 635 558 721 577 887 587 988 572 1120 574 1200 574V600H0Z" />
          <g opacity=".67">
            <path fill="#628d81" d="m66 578 14-54 14 54Zm199 9 15-58 16 58Zm286-5 14-52 14 52Zm334 10 17-63 17 63Zm234-11 14-55 14 55Z" />
            <path fill="#88a38a" d="m106 582 12-44 13 44Zm442 1 10-35 10 35Zm296 7 11-42 12 42Zm276-7 11-41 12 41Z" />
            <path fill="#b2b190" d="m303 587 10-38 11 38Zm316-3 11-44 12 44Zm283 8 12-48 13 48Z" />
          </g>
          <g stroke="#65897c" strokeWidth="3" opacity=".4">
            <path d="M80 578v11m200-2v10m285-15v10m337 0v8m231-19v11" />
          </g>
          <path fill="#c3cfb7" opacity=".35" d="M0 594C94 594 140 585 233 589S395 599 492 595 638 591 723 594 880 596 989 591C1050 590 1100 594 1200 594V600H0Z" />
        </>
      )}
    </svg>
  );
}

/** Ten lightweight SVG tiles; no extra animation loop, images, or paint filters. */
export const FlyingCatParallax = forwardRef<FlyingCatParallaxHandle>(function FlyingCatParallax(_, ref) {
  const scene = useRef<HTMLDivElement>(null);
  const tracks = useRef<(HTMLDivElement | null)[]>([]);
  const tileWidth = useRef(1200);
  const motionClock = useRef(0);
  const previousClock = useRef<number | null>(null);
  const frozenSeconds = useRef(0);
  const reducedMotion = useRef(false);

  const paint = () => {
    tracks.current.forEach((track, index) => {
      const offset = -(motionClock.current * LAYERS[index].speed % tileWidth.current);
      if (track) track.style.transform = `translate3d(${offset.toFixed(3)}px, 0, 0)`;
    });
  };

  useImperativeHandle(ref, () => ({
    advance(clockSeconds) {
      if (!Number.isFinite(clockSeconds) || clockSeconds < 0) return;
      // Rotation remounts the scene. Restore its saved phase once, even when
      // reduced motion is enabled; this is positioning, not an animation.
      if (previousClock.current === null) {
        previousClock.current = clockSeconds;
        motionClock.current = clockSeconds;
        paint();
        return;
      }
      if (clockSeconds === previousClock.current) return;
      if (previousClock.current !== null && clockSeconds < previousClock.current) frozenSeconds.current = 0;
      if (reducedMotion.current) {
        frozenSeconds.current += Math.max(0, clockSeconds - previousClock.current);
        previousClock.current = clockSeconds;
        return;
      }
      previousClock.current = clockSeconds;
      motionClock.current = Math.max(0, clockSeconds - frozenSeconds.current);
      paint();
    },
  }));

  useEffect(() => {
    const root = scene.current;
    if (!root) return;
    const measure = () => {
      const width = root.getBoundingClientRect().width;
      if (width > 0) tileWidth.current = width;
      // Repaint the existing clock, without advancing time while resizing.
      paint();
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : undefined;
    observer?.observe(root);
    window.addEventListener('resize', measure);

    const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined;
    const updatePreference = () => { reducedMotion.current = query?.matches ?? false; };
    updatePreference();
    query?.addEventListener?.('change', updatePreference);
    // Older iPad Safari versions expose only the legacy MediaQueryList API.
    if (query && !query.addEventListener) query.addListener(updatePreference);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      query?.removeEventListener?.('change', updatePreference);
      if (query && !query.removeEventListener) query.removeListener(updatePreference);
    };
  }, []);

  return (
    <div ref={scene} className="fc-sky-hills fc-parallax" aria-hidden="true">
      {LAYERS.map((layer, index) => (
        <div key={layer.name} className="fc-parallax-layer" data-layer={layer.name} data-speed={layer.speed}>
          <div ref={(node) => { tracks.current[index] = node; }} className="fc-parallax-track">
            <LandscapeTile layer={layer.name} />
            <LandscapeTile layer={layer.name} />
          </div>
        </div>
      ))}
    </div>
  );
});
