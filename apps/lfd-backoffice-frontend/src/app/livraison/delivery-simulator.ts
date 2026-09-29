import {
  type DeliveryRoutingSettingsPayload,
  type DeliverySimulationPayload,
  deliverySimulationPayloadSchema,
  SIMULATION_MAX_STOPS,
  SIMULATION_MAX_VEHICLES,
} from '@lfd/contracts';

import { detourFactorOf, detourPercentOf } from './delivery-routing';

/**
 * Les dérivations pures du **simulateur de tournée**
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 9, L9-C1 à
 * L9-C6) : ce qu'on saisit à l'écran, ce qui part au serveur, ce qu'on
 * exporte et ce qu'on réimporte.
 *
 * Ce fichier importe des VALEURS du contrat (le schéma, les bornes) : il tire
 * zod, et n'est lu que par l'écran du simulateur, chargé à part.
 */

export { SIMULATION_MAX_STOPS, SIMULATION_MAX_VEHICLES };

export interface GpsPoint {
  readonly lat: number;
  readonly lng: number;
}

export type GpsParse =
  { readonly ok: true; readonly gps: GpsPoint } | { readonly ok: false; readonly message: string };

const LAT_MAX = 90;
const LNG_MAX = 180;
const GPS_DECIMALS = 6;

/**
 * Lit des coordonnées collées depuis une carte : « 45.4485, 6.9823 » —
 * latitude PUIS longitude, séparées d'une virgule ou d'espaces. Une virgule
 * décimale à la française est refusée : « 45,4485, 6,9823 » est ambigu.
 */
export function parseGps(text: string): GpsParse {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, message: 'Coordonnées requises, par exemple « 45.4485, 6.9823 ».' };
  }
  const parts = trimmed.split(/\s*,\s*|\s+/u);
  if (parts.length !== 2) {
    return {
      ok: false,
      message: 'Deux nombres attendus — latitude puis longitude, par exemple « 45.4485, 6.9823 ».',
    };
  }
  const [lat, lng] = parts.map((part) => (/^-?\d+(\.\d+)?$/u.test(part) ? Number(part) : NaN));
  if (lat === undefined || lng === undefined || Number.isNaN(lat) || Number.isNaN(lng)) {
    return {
      ok: false,
      message: 'Nombres illisibles : un point pour les décimales, par exemple « 45.4485, 6.9823 ».',
    };
  }
  if (Math.abs(lat) > LAT_MAX) {
    return {
      ok: false,
      message: 'Latitude hors bornes (entre -90 et 90) : l’ordre est latitude, longitude.',
    };
  }
  if (Math.abs(lng) > LNG_MAX) {
    return { ok: false, message: 'Longitude hors bornes (entre -180 et 180).' };
  }
  return { ok: true, gps: { lat, lng } };
}

/** Un point, tel qu'on le recolle : « 45.4485, 6.9823 ». */
export function gpsText(gps: GpsPoint): string {
  const round = (value: number): string => String(Number(value.toFixed(GPS_DECIMALS)));
  return `${round(gps.lat)}, ${round(gps.lng)}`;
}

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
}

/** Les réglages en cours de saisie ; `null` : champ vidé, ou réglages illisibles. */
export interface SettingsDraft {
  /** Le facteur tel qu'on le lit (1,4), pas les centièmes du contrat. */
  readonly detourFactor: number | null;
  readonly averageSpeedKmh: number | null;
  readonly earliestDeparture: string;
  readonly maxRoundMinutes: number | null;
  readonly stopMinutes: number | null;
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
  detourFactor: null,
  averageSpeedKmh: null,
  earliestDeparture: '',
  maxRoundMinutes: null,
  stopMinutes: null,
  multiplePassages: false,
};

export function settingsDraftOf(settings: DeliveryRoutingSettingsPayload): SettingsDraft {
  return {
    detourFactor: detourFactorOf(settings.detourPercent),
    averageSpeedKmh: settings.averageSpeedKmh,
    earliestDeparture: settings.earliestDeparture,
    maxRoundMinutes: settings.maxRoundMinutes,
    stopMinutes: settings.stopMinutes,
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
  return { id: nextStopId(stops), label: '', coordinates: '', windowStart: '', windowEnd: '' };
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
    })),
    vehicles,
    settings,
    departure: 'configured',
    departureCoordinates: '',
  };
}

// ─── Ce qui part au serveur ────────────────────────────────────────────────

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
  if (!gps.ok || stop.label.trim() === '') {
    return null;
  }
  return {
    id: stop.id,
    label: stop.label.trim(),
    gps: gps.gps,
    window: end === '' ? null : { start: start === '' ? null : start, end },
  };
}

function buildSettings(
  draft: SettingsDraft,
  errors: string[],
): DeliveryRoutingSettingsPayload | null {
  const missing = [
    draft.detourFactor === null ? 'facteur de détour' : null,
    draft.averageSpeedKmh === null ? 'vitesse moyenne' : null,
    draft.earliestDeparture === '' ? 'départ au plus tôt' : null,
    draft.maxRoundMinutes === null ? 'durée maximale' : null,
    draft.stopMinutes === null ? 'temps d’arrêt' : null,
  ].filter((field) => field !== null);
  if (
    missing.length > 0 ||
    draft.detourFactor === null ||
    draft.averageSpeedKmh === null ||
    draft.maxRoundMinutes === null ||
    draft.stopMinutes === null
  ) {
    errors.push(`Réglages incomplets : ${missing.join(', ')}.`);
    return null;
  }
  return {
    detourPercent: detourPercentOf(draft.detourFactor),
    averageSpeedKmh: draft.averageSpeedKmh,
    earliestDeparture: draft.earliestDeparture.slice(0, 5),
    maxRoundMinutes: draft.maxRoundMinutes,
    stopMinutes: draft.stopMinutes,
    // Ignoré par le simulateur, toujours en tournées neuves (L9-C5) : le
    // contrat le demande, on y met la seule valeur qui ait un sens ici.
    defaultMode: 'new_rounds',
    multiplePassages: draft.multiplePassages,
  };
}

/**
 * Le scénario saisi, rendu au contrat — ou TOUTES ses fautes d'un coup,
 * chacune nommant l'arrêt qu'elle vise. Les bornes du domaine (un détour
 * sous ×1…) restent au serveur, qui dit sa phrase.
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
  const payload = parsed.data;
  return {
    ok: true,
    draft: {
      stops: payload.stops.map((stop) => ({
        id: stop.id,
        label: stop.label,
        coordinates: gpsText(stop.gps),
        windowStart: stop.window?.start ?? '',
        windowEnd: stop.window?.end ?? '',
      })),
      vehicles: payload.vehicles,
      settings: settingsDraftOf(payload.settings),
      departure: payload.departure === null ? 'configured' : 'custom',
      departureCoordinates: payload.departure === null ? '' : gpsText(payload.departure),
    },
  };
}
