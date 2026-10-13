// Pure shovel rules shared by the continuous and turn-based classroom games.
// Only units explicitly marked as paid for by the human Plants team may be
// refunded. Starter/CPU plants and older unmarked units have no paid price.
const MAX_RESOURCES = 1500;
const copy = value => structuredClone(value);

function placementTurnProblem(state) {
  if (!state || typeof state !== 'object' || !state.config) return 'No hay una partida activa.';
  if (state.config.mode === 'coop-zombies') return 'La pala sólo está disponible para el equipo humano de Plantas.';
  if (state.config.tempo === 'continuous' || state.phase === 'live') {
    if (state.phase !== 'live' || state.closing) return 'Ya terminó el tiempo para desplantar.';
    if (state.activeSide !== 'plants') return 'Espera el turno de compra de Plantas para usar la pala.';
    if (state.tacticalPhase && state.tacticalPhase !== 'shopping') return 'Espera a que la moneda abra la compra de Plantas.';
    if (state.initialStaging && !state.tacticalPhase) return 'Primero completa las preguntas y lanza la moneda.';
    return null;
  }
  if (state.phase !== 'planning' || state.activeSide !== 'plants' || state.planLocked?.plants) {
    return 'La pala sólo se puede usar durante el turno de colocación de Plantas.';
  }
  return null;
}

/** Check without mutating state, so the UI can show the exact refusal reason. */
export function checkUprootPlant(state, unitId) {
  const turnProblem = placementTurnProblem(state);
  if (turnProblem) return { allowed: false, reason: turnProblem, refund: 0 };
  const unit = state.units?.find(item => item.id === unitId);
  if (!unit || unit.side !== 'plants' || !Number.isFinite(unit.hp) || unit.hp <= 0) {
    return { allowed: false, reason: 'Selecciona una planta viva del tablero.', refund: 0 };
  }
  if (!Number.isFinite(unit.maxHp) || unit.maxHp <= 0 || unit.hp !== unit.maxHp || unit.everDamaged === true) {
    return { allowed: false, reason: 'Esta planta ya recibió daño y no se puede desplantar.', refund: 0 };
  }
  if (unit.purchasedBy !== 'plants' || !Number.isSafeInteger(unit.paidCost) || unit.paidCost <= 0) {
    return { allowed: false, reason: 'Esta planta no fue comprada por el equipo y no admite reembolso.', refund: 0 };
  }
  if (!Number.isFinite(state.resources?.plants) || !Number.isFinite(state.stats?.resourcesSpent?.plants)
    || state.stats.resourcesSpent.plants < unit.paidCost) {
    return { allowed: false, reason: 'No se puede verificar el pago de esta planta.', refund: 0 };
  }
  if (state.resources.plants + unit.paidCost > MAX_RESOURCES) {
    return { allowed: false, reason: `Gasta soles antes de usar la pala: el reembolso completo de ${unit.paidCost} superaría el máximo de ${MAX_RESOURCES}.`, refund: 0 };
  }
  return { allowed: true, reason: null, refund: unit.paidCost };
}

/** Remove one intact purchased plant and refund precisely its original price. */
export function uprootPlant(original, unitId) {
  const eligibility = checkUprootPlant(original, unitId);
  if (!eligibility.allowed) throw new Error(eligibility.reason);
  const state = copy(original);
  const index = state.units.findIndex(unit => unit.id === unitId);
  state.units.splice(index, 1);
  state.resources.plants += eligibility.refund;
  state.stats.resourcesSpent.plants -= eligibility.refund;
  // The projected balance stays at its pre-shopping value in secret modes.
  // `unitsPlaced` is a historical count; uprooting is not a defeat.
  return state;
}
