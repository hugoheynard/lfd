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

/**
 * Les dérivations pures du **simulateur de tournée**
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 9, L9-C1 à
 * L9-C6) : ce qu'on saisit à l'écran, ce qui part au serveur, ce qu'on
 * exporte et ce qu'on réimporte.
 *
 * Ce fichier importe des VALEURS du contrat (le schéma, les bornes) : il tire
 * zod, et n'est lu que par l'écran du simulateur, chargé à part.
 */

export {
  SIMULATION_MAX_STOP_MINUTES,
  SIMULATION_MAX_STOPS,
  SIMULATION_MAX_VEHICLES,
  SIMULATION_MIN_STOP_MINUTES,
  SIMULATION_SCENARIO_NAME_MAX,
};

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

// ─── Les scénarios enregistrés (L9-C7) ─────────────────────────────────────

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
