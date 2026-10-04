"use client";

import { useId, useState } from 'react';
import type { FlyingCatDifficulty } from '@/lib/activities/flying-cat';
import { PilotCat } from './PilotCat';
import './flying-cat-art.css';

type FlyingCatCoverProps = {
  title: string;
  instructions?: string;
  touch: boolean;
  onStart: () => void;
  onClose?: () => void;
  difficulty?: FlyingCatDifficulty;
  onDifficultyChange?: (difficulty: FlyingCatDifficulty) => void;
};

const difficulties: { value: FlyingCatDifficulty; label: string; description: string }[] = [
  { value: 'easy', label: 'Fácil', description: 'Vuelo tranquilo' },
  { value: 'normal', label: 'Normal', description: 'Ritmo equilibrado' },
  { value: 'hard', label: 'Difícil', description: 'Más desafío' },
];

export function FlyingCatCover({ title, instructions, touch, onStart, onClose, difficulty, onDifficultyChange }: FlyingCatCoverProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [localDifficulty, setLocalDifficulty] = useState<FlyingCatDifficulty>('normal');
  const selectedDifficulty = difficulty ?? localDifficulty;
  const difficultyId = useId();

  const changeDifficulty = (next: FlyingCatDifficulty) => {
    if (difficulty === undefined) setLocalDifficulty(next);
    onDifficultyChange?.(next);
  };

  return (
    <section className="fc-cover" aria-label="Portada de Flying Cat">
      <header className="fc-cover-header">
        <span className="fc-cover-eyebrow">Un vuelo de descubrimientos</span>
        {onClose && <button type="button" className="fc-cover-close" onClick={onClose} aria-label="Cerrar juego">Cerrar ×</button>}
      </header>

      <div className="fc-cover-grid">
        <div className="fc-cover-copy">
          <div className="fc-cover-intro">
            <span className="fc-cover-kicker">Lee · Pilota · Descubre</span>
            <h1>Flying <span>Cat</span></h1>
            <h2>{title}</h2>
            <p className="fc-cover-description">
              Lee la definición y vuela hacia el concepto correcto. Esquiva los demás conceptos y los obstáculos.
            </p>
            {instructions && <p className="fc-cover-teacher-note">{instructions}</p>}
          </div>

          <div className="fc-cover-actions">
            <fieldset className="fc-cover-difficulty" role="radiogroup" aria-label="Dificultad del vuelo" aria-describedby={`${difficultyId}-hint`}>
              <legend>Dificultad del vuelo</legend>
              <div className="fc-cover-difficulty-options">
                {difficulties.map((option) => (
                  <label key={option.value} className={`fc-cover-difficulty-option ${selectedDifficulty === option.value ? 'fc-cover-difficulty-option--selected' : ''}`}>
                    <input type="radio" name={`${difficultyId}-difficulty`} value={option.value} aria-label={option.label}
                      checked={selectedDifficulty === option.value} onChange={() => changeDifficulty(option.value)} />
                    <span><strong>{option.label}</strong><small>{option.description}</small></span>
                  </label>
                ))}
              </div>
              <p id={`${difficultyId}-hint`}>Sólo cambia el reto de vuelo. La calificación depende de tus respuestas, sin puntos extra por dificultad.</p>
            </fieldset>

            <button type="button" className="fc-cover-start" onClick={onStart}>
              Comenzar vuelo <span aria-hidden="true">→</span>
            </button>

            <div className="fc-cover-help">
              <div>
                <span className="fc-cover-help-icon" aria-hidden="true">{touch ? '☝' : '⌨'}</span>
                <strong>{touch ? 'Control táctil' : 'Teclado WASD'}</strong>
                <p>{touch ? 'Mantén presionados los botones de dirección en pantalla para pilotar.' : 'Usa W, A, S y D para mover el avión.'}</p>
              </div>
              <div>
                <span className="fc-cover-help-icon fc-cover-help-icon--answer" aria-hidden="true">✓</span>
                <strong>Un concepto a la vez</strong>
                <p>Las opciones irán pasando: toca con el avión sólo la correcta.</p>
              </div>
              <div>
                <span className="fc-cover-help-icon fc-cover-help-icon--shield" aria-hidden="true">◇</span>
                <strong>Aprende sin prisa</strong>
                <p>Lee la explicación en pausa. Al continuar tendrás 3 segundos de protección.</p>
              </div>
            </div>
          </div>
        </div>

        <figure className="fc-cover-illustration">
          <span className="fc-cover-tape fc-cover-tape--top" aria-hidden="true" />
          <div className="fc-cover-picture">
            {!imageFailed ? (
              <img
                src="/games/flying-cat/images/cat-aviator.jpg"
                alt="Gato aviador con gafas y bufanda verde, en un avión naranja sobre colinas de acuarela"
                width={1408}
                height={768}
                onError={() => setImageFailed(true)}
                draggable={false}
              />
            ) : (
              <div className="fc-cover-fallback"><PilotCat /><span className="fc-cover-fallback-hills" /></div>
            )}
            <div className="fc-cover-sky-puffs" aria-hidden="true"><i /><i /><i /></div>
          </div>
          <span className="fc-cover-tape fc-cover-tape--bottom" aria-hidden="true" />
          <figcaption>Lámina 1 · El gato aviador</figcaption>
        </figure>
      </div>
    </section>
  );
}
