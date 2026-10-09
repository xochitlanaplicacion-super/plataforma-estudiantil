/** A single prominent clock: the active question takes precedence over a wave. */
export function countdownView(snapshot, debate = null) {
  if (!snapshot || snapshot.phase === 'finished') return null;
  if (debate?.active && Number.isFinite(debate.seconds) &&
      (debate.kind === 'quiz' || debate.kind === 'planning' && snapshot.phase === 'planning')) {
    const seconds = Math.max(0, Math.ceil(debate.seconds));
    return { label: debate.kind === 'quiz' ? 'Responder' : 'Comprar', seconds,
      paused: !!debate.paused, expired: !!debate.expired,
      urgent: seconds <= 10 && !debate.paused && !debate.expired,
      note: debate.expired ? 'Tiempo de debate terminado' : debate.paused ? 'Reloj en pausa' : 'Tiempo de debate' };
  }
  if (snapshot.config?.tempo !== 'continuous' || snapshot.phase !== 'live') return null;
  const duration = snapshot.config.waveSeconds;
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const preparing = !!snapshot.initialStaging || !!snapshot.tacticalPhase;
  const paused = !!snapshot.paused || preparing;
  const seconds = snapshot.closing ? 0 : preparing ? duration : Math.max(0, Math.ceil(duration - (snapshot.waveElapsed || 0)));
  return { label: snapshot.closing ? 'Última horda' : `Oleada ${snapshot.pendingWave || snapshot.round}`,
    seconds, paused, expired: false, urgent: seconds <= 10 && !paused && !snapshot.closing,
    note: snapshot.closing ? 'Resolviendo supervivientes' : preparing ? 'Comienza al revelar' : paused ? 'Combate en pausa' : 'Hasta la siguiente oleada' };
}

export function formatCountdown(seconds) {
  const whole = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

export function renderCountdown(element, view) {
  element.hidden = !view;
  for (const state of ['urgent', 'paused', 'expired']) element.classList.toggle(state, !!view?.[state]);
  if (!view) return;
  element.querySelector('.quest-countdown-label').textContent = view.label;
  element.querySelector('.quest-countdown-value').textContent = formatCountdown(view.seconds);
  element.querySelector('.quest-countdown-note').textContent = view.note;
  element.setAttribute('aria-label', `${view.label}: ${view.seconds} segundos. ${view.note}`);
}
