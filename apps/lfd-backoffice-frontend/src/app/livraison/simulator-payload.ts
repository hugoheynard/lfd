import {
  type DeliveryRoutingSettingsPayload,
  type DeliverySimulationPayload,
  SIMULATION_MAX_STOP_MINUTES,
  SIMULATION_MAX_STOPS,
  SIMULATION_MAX_VEHICLES,
  SIMULATION_MIN_STOP_MINUTES,
} from '@lfd/contracts';

import type { ScenarioDraft, SettingsDraft, StopDraft } from './delivery-simulator';
import { type GpsPoint, parseGps } from './simulator-gps';

/**
 * Ce qui part au serveur : le scénario saisi, validé et rendu au contrat.
 * Séparé des brouillons parce que c'est la seule étape qui refuse.
 */

export type PayloadBuild =
  | { readonly ok: true; readonly payload: DeliverySimulationPayload }
  | { readonly ok: false; readonly errors: readonly string[] };

function stopName(stop: StopDraft, index: number): string {
  const label = stop.label.trim();
  return label === '' ? `Arrêt n° ${String(index + 1)}` : `« ${label} »`;
}

function buildStop(
  stop: StopDraft,
  index: number,
  errors: string[],
): DeliverySimulationPayload['stops'][number] | null {
  const name = stopName(stop, index);
  if (stop.label.trim() === '') {
    errors.push(`${name} : nom requis.`);
  }
  const gps = parseGps(stop.coordinates);
  if (!gps.ok) {
    errors.push(`${name} : ${gps.message}`);
  }
  const start = stop.windowStart.trim();
  const end = stop.windowEnd.trim();
  if (start !== '' && end === '') {
    errors.push(`${name} : une fenêtre a besoin d’une fin (le début seul ne dit rien).`);
  }
  if (start !== '' && end !== '' && start >= end) {
    errors.push(`${name} : la fenêtre finit avant de commencer.`);
  }
  const minutes = stop.stopMinutes;
  const minutesValid =
    minutes === null ||
    (Number.isInteger(minutes) &&
      minutes >= SIMULATION_MIN_STOP_MINUTES &&
      minutes <= SIMULATION_MAX_STOP_MINUTES);
  if (!minutesValid) {
    errors.push(
      `${name} : temps sur place entre ${String(SIMULATION_MIN_STOP_MINUTES)} et ${String(SIMULATION_MAX_STOP_MINUTES)} minutes, ou vide pour celui des réglages.`,
    );
  }
  if (!gps.ok || stop.label.trim() === '' || !minutesValid) {
    return null;
  }
  return {
    id: stop.id,
    label: stop.label.trim(),
    gps: gps.gps,
    window: end === '' ? null : { start: start === '' ? null : start, end },
    ...(minutes === null ? {} : { stopMinutes: minutes }),
  };
}

function buildSettings(
  draft: SettingsDraft,
  errors: string[],
): DeliveryRoutingSettingsPayload | null {
  const missing = [
    draft.earliestDeparture === '' ? 'départ quand rien ne presse' : null,
    draft.maxRoundMinutes === null ? 'durée maximale' : null,
    draft.stopMinutes === null ? 'temps de livraison sur place' : null,
    draft.safetyMarginMinutes === null ? 'marge de sécurité' : null,
  ].filter((field) => field !== null);
  if (
    missing.length > 0 ||
    draft.maxRoundMinutes === null ||
    draft.stopMinutes === null ||
    draft.safetyMarginMinutes === null
  ) {
    errors.push(`Réglages incomplets : ${missing.join(', ')}.`);
    return null;
  }
  return {
    earliestDeparture: draft.earliestDeparture.slice(0, 5),
    maxRoundMinutes: draft.maxRoundMinutes,
    stopMinutes: draft.stopMinutes,
    safetyMarginMinutes: draft.safetyMarginMinutes,
    // Ignoré par le simulateur, toujours en tournées neuves (L9-C5) : le
    // contrat le demande, on y met la seule valeur qui ait un sens ici.
    defaultMode: 'new_rounds',
    multiplePassages: draft.multiplePassages,
  };
}

/**
 * Le scénario saisi, rendu au contrat — ou TOUTES ses fautes d'un coup,
 * chacune nommant l'arrêt qu'elle vise. Les bornes du domaine (une marge
 * au-delà de 90 minutes…) restent au serveur, qui dit sa phrase.
 */
export function buildPayload(draft: ScenarioDraft): PayloadBuild {
  const errors: string[] = [];
  if (draft.stops.length === 0) {
    errors.push('Au moins un arrêt.');
  }
  if (draft.stops.length > SIMULATION_MAX_STOPS) {
    errors.push(`${String(SIMULATION_MAX_STOPS)} arrêts au plus.`);
  }
  const stops = draft.stops.map((stop, index) => buildStop(stop, index, errors));
  const vehicles = draft.vehicles.map((name) => name.trim());
  if (vehicles.length === 0) {
    errors.push('Au moins un véhicule.');
  }
  if (vehicles.length > SIMULATION_MAX_VEHICLES) {
    errors.push(`${String(SIMULATION_MAX_VEHICLES)} véhicules au plus.`);
  }
  if (vehicles.some((name) => name === '')) {
    errors.push('Chaque véhicule a besoin d’un nom.');
  }
  const settings = buildSettings(draft.settings, errors);
  let departure: GpsPoint | null = null;
  if (draft.departure === 'custom') {
    const gps = parseGps(draft.departureCoordinates);
    if (gps.ok) {
      departure = gps.gps;
    } else {
      errors.push(`Point de départ : ${gps.message}`);
    }
  }
  const located = stops.filter((stop) => stop !== null);
  if (errors.length > 0 || settings === null || located.length !== stops.length) {
    return { ok: false, errors };
  }
  return { ok: true, payload: { stops: located, vehicles, settings, departure } };
}
