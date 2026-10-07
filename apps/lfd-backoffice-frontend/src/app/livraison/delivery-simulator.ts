import {
  type DeliveryRoutingSettingsPayload,
  type DeliverySimulationPayload,
  deliverySimulationPayloadSchema,
  SIMULATION_MAX_STOP_MINUTES,
  SIMULATION_MAX_STOPS,
  SIMULATION_MAX_VEHICLES,
  SIMULATION_MIN_STOP_MINUTES,
  SIMULATION_SCENARIO_NAME_MAX,
} from '@lfd/contracts';

import { gpsText } from './simulator-gps';

/**
 * Les dérivations pures du **simulateur de tournée**
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 9, L9-C1 à
 * L9-C6) : ce qu'on saisit à l'écran, ce qui part au serveur, ce qu'on
 * exporte et ce qu'on réimporte.
 *
 * Ce fichier importe des VALEURS du contrat (le schéma, les bornes) : il tire
 * zod, et n'est lu que par l'écran du simulateur, chargé à part.
 */

export * from './simulator-gps';
export * from './simulator-payload';
export * from './simulator-saved-scenarios';

export {
  SIMULATION_MAX_STOP_MINUTES,
  SIMULATION_MAX_STOPS,
  SIMULATION_MAX_VEHICLES,
  SIMULATION_MIN_STOP_MINUTES,
  SIMULATION_SCENARIO_NAME_MAX,
};

// ─── Le scénario tel qu'on le saisit ───────────────────────────────────────

/** Un arrêt en cours de saisie : tout est texte, rien n'est encore validé. */
export interface StopDraft {
  readonly id: string;
  readonly label: string;
  readonly coordinates: string;
  /** `HH:MM`, ou vide : « dès l'ouverture ». */
  readonly windowStart: string;
  /** `HH:MM`, ou vide : pas de fenêtre. */
  readonly windowEnd: string;
  /** Le temps sur place propre à l'arrêt ; `null` : celui des réglages (L9-C8). */
  readonly stopMinutes: number | null;
}

/** Les réglages en cours de saisie ; `null` : champ vidé, ou réglages illisibles. */
/**
 * Les réglages en cours de saisie ; `null` : champ vidé, ou réglages illisibles.
 * Ni détour ni vitesse : le calcul ne les lit plus depuis le lot 10 bis
 * (L10b-C5), et le contrat les rend optionnels.
 */
export interface SettingsDraft {
  readonly earliestDeparture: string;
  readonly maxRoundMinutes: number | null;
  /** Le « temps de livraison sur place » par défaut (lot 7 ter, L7t-C3). */
  readonly stopMinutes: number | null;
  /** La marge avant la fin d'un créneau (L7t-C1). */
  readonly safetyMarginMinutes: number | null;
  readonly multiplePassages: boolean;
}

export type DepartureChoice = 'configured' | 'custom';

export interface ScenarioDraft {
  readonly stops: readonly StopDraft[];
  readonly vehicles: readonly string[];
  readonly settings: SettingsDraft;
  readonly departure: DepartureChoice;
  readonly departureCoordinates: string;
}

export const EMPTY_SETTINGS: SettingsDraft = {
  earliestDeparture: '',
  maxRoundMinutes: null,
  stopMinutes: null,
  safetyMarginMinutes: null,
  multiplePassages: false,
};

export function settingsDraftOf(settings: DeliveryRoutingSettingsPayload): SettingsDraft {
  return {
    earliestDeparture: settings.earliestDeparture,
    maxRoundMinutes: settings.maxRoundMinutes,
    stopMinutes: settings.stopMinutes,
    // Optionnelle au contrat : un fichier exporté avant le lot 7 ter ne l'a pas.
    safetyMarginMinutes: settings.safetyMarginMinutes ?? null,
    multiplePassages: settings.multiplePassages,
  };
}

const STOP_ID_PREFIX = 'arret-';

/** Un identifiant local neuf, jamais celui d'un arrêt présent. */
export function nextStopId(stops: readonly StopDraft[]): string {
  const taken = stops
    .map((stop) =>
      stop.id.startsWith(STOP_ID_PREFIX) ? Number(stop.id.slice(STOP_ID_PREFIX.length)) : 0,
    )
    .filter((n) => Number.isInteger(n));
  return `${STOP_ID_PREFIX}${String(Math.max(0, ...taken) + 1)}`;
}

export function emptyStop(stops: readonly StopDraft[]): StopDraft {
  return {
    id: nextStopId(stops),
    label: '',
    coordinates: '',
    windowStart: '',
    windowEnd: '',
    stopMinutes: null,
  };
}

/**
 * Le scénario d'exemple du premier affichage : le labo de Val d'Isère (le
 * départ réglé) et six arrêts de la vallée. Des lieux, jamais des clients.
 */
const EXAMPLE_STOPS: readonly (readonly [string, string])[] = [
  ['Arrêt La Daille', '45.4602, 6.9649'],
  ['Arrêt Val d’Isère centre', '45.4496, 6.9787'],
  ['Arrêt Le Fornet', '45.4503, 7.0111'],
  ['Arrêt Arc 1800', '45.5734, 6.7788'],
  ['Arrêt Bourg-Saint-Maurice', '45.6186, 6.7695'],
  ['Arrêt La Rosière', '45.6286, 6.8478'],
];

export function exampleScenario(
  vehicles: readonly string[],
  settings: SettingsDraft,
): ScenarioDraft {
  return {
    stops: EXAMPLE_STOPS.map(([label, coordinates], index) => ({
      id: `${STOP_ID_PREFIX}${String(index + 1)}`,
      label,
      coordinates,
      windowStart: '',
      windowEnd: '',
      stopMinutes: null,
    })),
    vehicles,
    settings,
    departure: 'configured',
    departureCoordinates: '',
  };
}

// ─── Export et import (L9-C1) ──────────────────────────────────────────────

export const SCENARIO_FILE_NAME = 'scenario-tournee.json';

/** Le fichier exporté : le corps même de « Proposer », lisible à l'œil. */
export function scenarioFileContent(payload: DeliverySimulationPayload): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export type ScenarioImport =
  | { readonly ok: true; readonly draft: ScenarioDraft }
  | { readonly ok: false; readonly message: string };

function issuePath(path: readonly PropertyKey[]): string {
  const [head, index, ...rest] = path;
  if (head === 'stops' && typeof index === 'number') {
    return `arrêt n° ${String(index + 1)}${rest.length > 0 ? ` (${rest.map(String).join('.')})` : ''}`;
  }
  if (head === 'vehicles' && typeof index === 'number') {
    return `véhicule n° ${String(index + 1)}`;
  }
  return path.length === 0 ? 'fichier' : path.map(String).join('.');
}

/** Relit un fichier exporté ; refuse tout ce que le contrat refuserait, en le disant. */
export function importScenario(text: string): ScenarioImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: 'Ce fichier n’est pas du JSON lisible.' };
  }
  const parsed = deliverySimulationPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      message:
        issue === undefined
          ? 'Ce fichier n’est pas un scénario de tournée.'
          : `Ce fichier n’est pas un scénario de tournée — ${issuePath(issue.path)} : ${issue.message}.`,
    };
  }
  return { ok: true, draft: scenarioDraftOf(parsed.data) };
}

/**
 * Un scénario du contrat, rendu à l'écran : un fichier importé, un scénario
 * rouvert (L9-C7), une journée copiée (L9-C8) passent tous par ici.
 */
export function scenarioDraftOf(payload: DeliverySimulationPayload): ScenarioDraft {
  return {
    stops: payload.stops.map((stop) => ({
      id: stop.id,
      label: stop.label,
      coordinates: gpsText(stop.gps),
      windowStart: stop.window?.start ?? '',
      windowEnd: stop.window?.end ?? '',
      stopMinutes: stop.stopMinutes ?? null,
    })),
    vehicles: payload.vehicles,
    settings: settingsDraftOf(payload.settings),
    departure: payload.departure === null ? 'configured' : 'custom',
    departureCoordinates: payload.departure === null ? '' : gpsText(payload.departure),
  };
}
