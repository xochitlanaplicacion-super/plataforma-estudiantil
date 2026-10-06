'use client';

import { useId } from 'react';
import type { NavalShipKind } from '@/lib/activities/naval-battle';

export const NAVAL_UNIT_NAMES: Record<NavalShipKind, string> = {
  nuclear: 'Submarino nuclear',
  semi_nuclear: 'Submarino seminuclear',
  carrier: 'Portaaviones',
  supply: 'Base de suministros',
  destroyer: 'Destructor',
  troops: 'Tropas terrestres',
  hospital: 'Hospital',
};

/** All illustrations are vectors. No downloaded or licensed game artwork is used. */
export function NavalUnitIcon({ kind, sunk = false, className = '' }: {
  kind: NavalShipKind;
  sunk?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const metal = `naval-metal-${uid}`;
  const shade = `naval-shade-${uid}`;
  return (
    <svg viewBox="0 0 160 100" aria-hidden="true" focusable="false" className={`nb-unit-icon ${sunk ? 'nb-unit-icon--sunk' : ''} ${className}`}>
      <defs>
        <linearGradient id={metal} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sunk ? '#666a6d' : '#e0eff2'} />
          <stop offset=".45" stopColor={sunk ? '#46515a' : '#8faaba'} />
          <stop offset="1" stopColor={sunk ? '#283138' : '#304f68'} />
        </linearGradient>
        <linearGradient id={shade} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#e0fbff" /><stop offset="1" stopColor="#219aab" />
        </linearGradient>
      </defs>
      {kind === 'hospital' ? (
        <g stroke="#274954" strokeWidth="2.4" strokeLinejoin="round">
          <path d="M20 8h118v37H82v45H20Z" fill={sunk ? '#8a979c' : '#e4edef'} />
          <path d="M27 15h104v22H75v46H27Z" fill={sunk ? '#617279' : '#9bbbc3'} />
          <path d="M28 15h42v68H28Z" fill="#e7eeea" /><path d="M79 16h50v20H79Z" fill="#e7eeea" />
          <path d="M40 31h15v11h11v15H55v11H40V57H29V42h11Z" fill="#ec675c" stroke="#9f3d3a" strokeWidth="1" />
          <path d="M91 22h11m8 0h11M61 72v10m-7-10v10" stroke="#436f87" strokeWidth="4" />
          <path d="M17 90h69M138 45V8" stroke="#6cf1df" strokeWidth="2" />
        </g>
      ) : kind === 'troops' ? (
        <g stroke="#193c32" strokeWidth="2.4" strokeLinejoin="round">
          <path d="M36 78 61 27h38l25 51Z" fill="#5c7e54" />
          <path d="m61 27 21 51H36m46 0 17-51" fill="none" stroke="#bac78b" />
          <path d="M76 50h14v28H76Z" fill="#203b31" />
          <path d="M25 80h109" stroke="#d5c99a" />
          <path d="M121 70V23m0 0h21l-7 8 7 8h-21" fill="#f2b853" />
          <circle cx="53" cy="58" r="6" fill="#b2bdaa" /><path d="M47 65v10m12-10v10" stroke="#294f37" strokeWidth="7" />
        </g>
      ) : kind === 'supply' ? (
        <g stroke="#273e4d" strokeWidth="2.2" strokeLinejoin="round">
          <path d="M78 15 145 80H16Z" fill={`url(#${metal})`} />
          <path d="M79 24 131 75H30Z" fill="#396f72" />
          <path d="M66 41h27v27H66Z" fill="#d9c08e" /><path d="M80 41v27m-14-14h27" stroke="#856c43" />
          <path d="M38 68V47h20v21m46 0V47h20v21" fill="#9db9b2" />
          <path d="M77 32h9m-5-4v9" stroke="#f4d366" />
          <circle cx="79" cy="18" r="4" fill="#6fe4db" />
        </g>
      ) : kind === 'carrier' ? (
        <g stroke="#18384b" strokeWidth="2.2" strokeLinejoin="round">
          <path d="M18 27h112l15 21-19 29H18L8 65V39Z" fill={`url(#${metal})`} />
          <path d="M22 31h102l10 17-13 22H22Z" fill="#274b60" />
          <path d="M25 54h100" stroke="#eef0d4" strokeDasharray="10 5" />
          <path d="M57 27V13h39v19" fill="#829ca7" /><path d="M66 13V8h17v10" fill="#d4dde0" />
          <path d="m43 40 8-8 3 8 9 4-12 2-5 8-2-8-10-2Zm47 23 8-8 3 8 9 4-12 2-5 8-2-8-10-2Z" fill="#d7e9e8" strokeWidth="1" />
          <path d="M112 20V7m-7 3h14" stroke="#67ddd9" /><circle cx="118" cy="35" r="3" fill="#f7c65e" />
        </g>
      ) : (
        <g stroke="#173448" strokeWidth="2.2" strokeLinejoin="round">
          <path d={kind === 'destroyer' ? 'M13 34 119 29l29 21-29 21L13 66 5 50Z' : 'M27 29h101c30 0 30 42 0 42H27C-1 71-1 29 27 29Z'} fill={`url(#${metal})`} />
          <path d="M27 37h92l18 13-18 13H27Z" fill="#416b7f" strokeWidth="1" />
          <path d="M54 33V19h39v17l8 7H47Z" fill="#97b6bf" /><path d="M62 21h20v8H62Z" fill="#234c60" />
          <path d="M76 19V9h12m-20 4h13" fill="none" stroke="#a7f1ee" />
          <path d="M23 39v23m-7-18v13" stroke="#cedfe2" />
          <circle cx="116" cy="49" r={kind === 'destroyer' ? '8' : '11'} fill="#203f53" />
          {kind === 'destroyer' ? <path d="M117 48h19m-31 11H89" stroke="#beced3" strokeWidth="4" /> : <g fill="#eaca60" stroke="none"><circle cx="116" cy="49" r="3" /><path d="m113 45-5-7a13 13 0 0 1 15 0l-5 7Zm7 5 9-1a13 13 0 0 1-8 13l-3-8Zm-7 4-3 8a13 13 0 0 1-8-13l9 1Z" /></g>}
          {kind === 'semi_nuclear' && <path d="M100 37h29" stroke="#88deca" strokeWidth="3" />}
        </g>
      )}
      {sunk && <g className="nb-icon-wreck"><path d="m53 39 15 12-9 8 19 13m26-41-6 17 13 4-7 17" fill="none" stroke="#07131b" strokeWidth="4" /><path d="m66 51-9-18c15 5 10-12 18-21 0 17 20 24 14 39Z" fill="#ff5b32" /><path d="M69 51c-7-7 3-15 4-21 1 9 10 13 5 21Z" fill="#ffe091" /></g>}
    </svg>
  );
}

export function NavalPalm({ variation = 0 }: { variation?: number }) {
  return <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={`nb-palm nb-palm--${variation % 3}`}>
    <path d="M52 83q-7-25 3-50" fill="none" stroke="#927344" strokeWidth="9" strokeLinecap="round" />
    <path d="M50 74h9m-9-12h9m-8-11h8" stroke="#5d4d32" strokeWidth="2" />
    <g className="nb-palm-fronds" fill="#308a61" stroke="#1b6e4f" strokeWidth="1.5"><path d="M55 33C28 7 14 20 9 40q21-13 46-7Z" /><path d="M55 33C60 4 85 10 94 29q-19-5-39 4Z" /><path d="M55 33C25 27 23 44 20 61q19-20 35-28Z" /><path d="M55 33C83 27 91 48 89 62Q74 42 55 33Z" /><path d="M55 33C46 8 56 2 64 3l-9 30Z" /></g>
    <circle cx="54" cy="35" r="4" fill="#af8146" /><circle cx="59" cy="39" r="4" fill="#825d35" />
  </svg>;
}
