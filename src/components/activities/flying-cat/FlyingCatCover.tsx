"use client";

import { useState } from 'react';
import { PilotCat } from './PilotCat';
import './flying-cat-art.css';

type FlyingCatCoverProps = {
  title: string;
  instructions?: string;
  touch: boolean;
  onStart: () => void;
  onClose?: () => void;
};

export function FlyingCatCover({ title, instructions, touch, onStart, onClose }: FlyingCatCoverProps) {
  const [imageFailed, setImageFailed] = useState(false);

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
            <button type="button" className="fc-cover-start" onClick={onStart}>
              Comenzar vuelo <span aria-hidden="true">→</span>
            </button>

            <div className="fc-cover-help">
              <div>
                <span className="fc-cover-help-icon" aria-hidden="true">{touch ? '☝' : '⌨'}</span>
                <strong>{touch ? 'Control táctil' : 'WASD o flechas'}</strong>
                <p>{touch ? 'Usa las flechas en pantalla para pilotar.' : 'Mueve el avión con el teclado.'}</p>
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
