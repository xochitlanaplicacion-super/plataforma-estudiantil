'use client';

import type { FlightBonusKind } from '@/lib/activities/flying-cat-engine';

export const FLYING_CAT_BONUS_INFO: Record<FlightBonusKind, { name: string; description: string }> = {
  extra_life: { name: 'Vida extra', description: 'Recupera una vida. Puedes tener hasta 5.' },
  slow_time: { name: 'Cámara lenta', description: 'Frena conceptos, obstáculos y paisaje durante 8 segundos de vuelo. Tu avión mantiene su velocidad.' },
  points_x2: { name: 'Puntos ×2', description: 'Duplica los puntos de tu próximo acierto. Sustituye otro multiplicador activo.' },
  points_x3: { name: 'Puntos ×3', description: 'Triplica los puntos de tu próximo acierto. Sustituye otro multiplicador activo.' },
  lightning: { name: 'Rayo', description: 'Derriba los obstáculos sin dañarte y deja pasar sólo la respuesta correcta de esta definición.' },
  reveal: { name: 'Señalar respuesta', description: 'Resalta la tarjeta correcta de esta definición cuando aparezca. Debes alcanzarla con el avión.' },
};

export function FlyingCatBonusIcon({ kind }: { kind: FlightBonusKind }) {
  return <svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    {kind === 'extra_life' && <path fill="#d96551" stroke="#a44b38" d="M16 27 5 17C-2 9 9 1 16 10 23 1 34 9 27 17Z" />}
    {kind === 'slow_time' && <><circle cx="16" cy="17" r="11" fill="#dcf3f0" /><path d="M16 10v8l5 3M11 2h10M16 2v4" /></>}
    {(kind === 'points_x2' || kind === 'points_x3') && <><path fill="#ffe7a1" stroke="#ba8632" d="m16 2 4 8 9 2-7 7 2 10-8-5-8 5 2-10-7-7 9-2Z" /><text x="16" y="21" textAnchor="middle" fontSize="13" fontWeight="900" stroke="none" fill="#72552b">{kind === 'points_x2' ? '×2' : '×3'}</text></>}
    {kind === 'lightning' && <path fill="#ffe494" stroke="#af8332" d="m18 2-12 17h9l-1 11L27 13h-9Z" />}
    {kind === 'reveal' && <><path fill="#d6edb9" d="M2 16S8 6 16 6s14 10 14 10-6 10-14 10S2 16 2 16Z" /><circle cx="16" cy="16" r="5" fill="#4c8b72" /><path stroke="#fff" d="m13 16 2 2 4-4" /></>}
  </svg>;
}

export function FlyingCatBonusGuide({ touch }: { touch: boolean }) {
  return <section className="fc-bonus-guide" aria-label="Cómo usar los premios">
    <h3>Premios por acertar</h3>
    <p>Un acierto te da un premio aleatorio si hay espacio. Guarda hasta <strong>2 bonus</strong> y úsalos mientras vuelas:
      {' '}{touch ? 'toca sus botones a la derecha.' : 'pulsa E para el primero y R para el segundo.'}</p>
    <ul>{(Object.keys(FLYING_CAT_BONUS_INFO) as FlightBonusKind[]).map((kind) => <li key={kind}>
      <FlyingCatBonusIcon kind={kind} /><div><strong>{FLYING_CAT_BONUS_INFO[kind].name}</strong><p>{FLYING_CAT_BONUS_INFO[kind].description}</p></div>
    </li>)}</ul>
    <p className="fc-help">Los premios cambian el vuelo y sus puntos, no añaden puntos extra a tu calificación. Los efectos se detienen durante las pausas.</p>
  </section>;
}
