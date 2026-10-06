'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Clock3, Pause, Play, Shield } from 'lucide-react';
import type { NavalQuestion } from '@/lib/activities/naval-questions';
import { useNavalTimer } from './useNavalTimer';

export interface NavalDefenseChallengeProps {
  question: NavalQuestion;
  defenderName: string;
  paused: boolean;
  onResolve: (correct: boolean) => void;
  onCancel: () => void;
  onPause: () => void;
}

/** One optional oral defense from the already prepared pool. No AI/network call occurs here. */
export function NavalDefenseChallenge({ question, defenderName, paused, onResolve, onCancel, onPause }: NavalDefenseChallengeProps) {
  const headingId = useId();
  const instructionsId = useId();
  const decidedRef = useRef(false);
  const [decided, setDecided] = useState(false);
  useEffect(() => { decidedRef.current = false; setDecided(false); }, [question.id]);

  function resolve(correct: boolean) {
    if (paused || decidedRef.current) return;
    // Acquire before the callback: a double tap or clock tick cannot resolve the same missile twice.
    decidedRef.current = true; setDecided(true); onResolve(correct);
  }
  function cancel() {
    if (paused || decidedRef.current) return;
    decidedRef.current = true; setDecided(true); onCancel();
  }
  const remaining = useNavalTimer(`defense:${question.id}`, 10, !paused && !decided, () => resolve(false));

  return <div className="naval-overlay naval-defense" role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={instructionsId}>
    <section className="naval-panel naval-review-dialog">
      <span className="naval-eyebrow"><Shield size={18} aria-hidden="true"/> DEFENSA OPCIONAL · ATAQUE NUCLEAR</span>
      <h2 id={headingId}>{defenderName}: ¡defiendan su flota!</h2>
      <p id={instructionsId}>El equipo debate y el profesor toca su respuesta. Un acierto reduce la bomba nuclear a una cruz de 5 coordenadas; una respuesta incorrecta, el tiempo agotado o seguir sin reto conserva el área de 9 coordenadas.</p>
      <div className="naval-toolbar">
        <div className={`naval-clock ${remaining <= 3 ? 'naval-clock--urgent' : ''}`} role="timer" aria-label="Tiempo restante para defender la flota"><Clock3 size={18} aria-hidden="true"/><strong>{remaining}s</strong></div>
        <button type="button" className="naval-button naval-button--quiet" disabled={decided} onClick={onPause}>
          {paused ? <Play size={17} aria-hidden="true"/> : <Pause size={17} aria-hidden="true"/>}{paused ? 'Reanudar reto' : 'Pausar reto'}
        </button>
        {paused && <span role="status">Reto en pausa: el reloj está detenido.</span>}
      </div>
      <p className="naval-eyebrow">{question.type === 'true_false' ? 'VERDADERO / FALSO' : 'OPCIÓN MÚLTIPLE'}</p>
      <h3>{question.prompt}</h3>
      <div className="naval-answer-grid">
        {question.options.map((option, index) => <button type="button" key={index} className="naval-answer" disabled={paused || decided} onClick={() => resolve(index === question.correctIndex)}><span aria-hidden="true">{String.fromCharCode(65 + index)}</span>{option}</button>)}
      </div>
      <button type="button" className="naval-button naval-button--quiet" disabled={paused || decided} onClick={cancel}>Seguir sin reto</button>
    </section>
  </div>;
}
