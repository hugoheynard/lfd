import { SIMULATION_SCENARIO_NAME_MAX } from '@lfd/contracts';

import type { ScenarioDraft } from './delivery-simulator';

/**
 * Les scénarios enregistrés (L9-C7) : empreinte, nom, libellés de liste.
 * Rien ici ne fabrique de brouillon — on ne fait que les nommer et les comparer.
 */

/**
 * L'empreinte d'un brouillon, pour dire « modifié depuis l'enregistrement » :
 * deux brouillons de même empreinte enverraient le même scénario.
 */
export function draftKey(draft: ScenarioDraft): string {
  return JSON.stringify({
    stops: draft.stops.map((stop) => [
      stop.id,
      stop.label.trim(),
      stop.coordinates.trim(),
      stop.windowStart,
      stop.windowEnd,
      stop.stopMinutes,
    ]),
    vehicles: draft.vehicles.map((name) => name.trim()),
    settings: {
      ...draft.settings,
      earliestDeparture: draft.settings.earliestDeparture.slice(0, 5),
    },
    departure: draft.departure,
    departureCoordinates: draft.departure === 'custom' ? draft.departureCoordinates.trim() : '',
  });
}

/** La faute d'un nom de scénario, ou `null`. L'unicité reste au serveur. */
export function scenarioNameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') {
    return 'Donnez un nom au scénario.';
  }
  if (trimmed.length > SIMULATION_SCENARIO_NAME_MAX) {
    return `${String(SIMULATION_SCENARIO_NAME_MAX)} caractères au plus.`;
  }
  return null;
}

/** Le nom proposé pour « Enregistrer sous… » : jamais celui qu'on vient de quitter. */
export function copyNameOf(name: string | null): string {
  return name === null ? '' : `${name} (copie)`.slice(0, SIMULATION_SCENARIO_NAME_MAX);
}

/** « 12 arrêts · 3 véhicules ». */
export function scenarioSizeLabel(stops: number, vehicles: number): string {
  const plural = (n: number, word: string): string => `${String(n)} ${word}${n > 1 ? 's' : ''}`;
  return `${plural(stops, 'arrêt')} · ${plural(vehicles, 'véhicule')}`;
}

const UPDATED_AT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/** « 29/09/2026 14:05 · Marie » — qui a enregistré en dernier, et quand. */
export function scenarioUpdatedLabel(updatedAt: string, updatedBy: string | null): string {
  const when = UPDATED_AT.format(new Date(updatedAt));
  return updatedBy === null ? when : `${when} · ${updatedBy}`;
}
