import type {
  BinTypeView,
  DeliveryDefaultContainer,
  DeliveryDefaultDemandView,
  DeliveryProposalMode,
  DeliveryProposalWindow,
  DeliveryRoundProposalView,
  DeliveryRoutingSettingsPayload,
  DeliveryUnlocatedReason,
} from '@lfd/contracts';

import { fulfillmentWindowLabel } from '../shared/window-label';

/**
 * Les dérivations pures du calculateur de tournée
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 7).
 *
 * Type-only sur le contrat, comme `delivery-rounds.ts` : une valeur importée
 * de `@lfd/contracts` tirerait zod dans le paquet de la page.
 */

const MINUTES_PER_HOUR = 60;
const METERS_PER_KM = 1000;
const PERCENT = 100;

/** « 45 min », « 1 h 05 », « 2 h ». */
export function durationLabel(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < MINUTES_PER_HOUR) {
    return `${String(whole)} min`;
  }
  const hours = Math.floor(whole / MINUTES_PER_HOUR);
  const rest = whole % MINUTES_PER_HOUR;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest).padStart(2, '0')}`;
}

/** « 12,3 km » — au dixième, en français. */
export function distanceLabel(meters: number): string {
  return `${(meters / METERS_PER_KM).toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
}

/** « fenêtre 8 h 00 – 10 h 00 », « fenêtre avant 10 h 00 ». */
export function proposalWindowLabel(window: DeliveryProposalWindow): string {
  return `fenêtre ${fulfillmentWindowLabel(window)}`;
}

/** Le facteur de détour tel qu'on le lit : 140 → 1,4. */
export function detourFactorOf(percent: number): number {
  return percent / PERCENT;
}

/** Le facteur saisi, rendu en centièmes pour le contrat : 1,4 → 140. */
export function detourPercentOf(factor: number): number {
  return Math.round(factor * PERCENT);
}

/**
 * Ce que valent les heures d'une simulation (lot 8, L8-C3). Depuis le lot 10
 * bis (L10b-C5), le serveur refuse au lieu de retomber sur le vol d'oiseau :
 * `estimate` est déprécié et vaut toujours `road`. La branche `crow_flies`
 * reste pour un serveur plus ancien, sans chiffres — détour et vitesse ne se
 * règlent plus.
 *
 * Seul le simulateur (lot 9) l'affiche encore ; l'écran « Planifier » n'en dit
 * plus rien.
 */
export function estimateLabel(proposal: Pick<DeliveryRoundProposalView, 'estimate'>): string {
  if (proposal.estimate === 'road') {
    return 'Durées par la route (carte de la Savoie) : les heures restent indicatives, pas des promesses.';
  }
  return 'Estimation à vol d’oiseau — le calcul routier ne répond pas ou n’est pas branché : les heures et les durées sont indicatives, pas des promesses.';
}

/** Deux réglages sont-ils les mêmes ? — « Enregistrer » n'est cliquable que s'ils diffèrent. */
export function sameSettings(
  a: DeliveryRoutingSettingsPayload,
  b: DeliveryRoutingSettingsPayload,
): boolean {
  return (
    a.detourPercent === b.detourPercent &&
    a.averageSpeedKmh === b.averageSpeedKmh &&
    a.earliestDeparture === b.earliestDeparture &&
    a.maxRoundMinutes === b.maxRoundMinutes &&
    a.stopMinutes === b.stopMinutes &&
    a.safetyMarginMinutes === b.safetyMarginMinutes &&
    a.binGapCm === b.binGapCm &&
    a.defaultMode === b.defaultMode &&
    a.multiplePassages === b.multiplePassages &&
    sameContainer(a.defaultContainer ?? null, b.defaultContainer ?? null)
  );
}

function sameContainer(
  a: DeliveryDefaultContainer | null,
  b: DeliveryDefaultContainer | null,
): boolean {
  return a === null || b === null ? a === b : a.binTypeId === b.binTypeId && a.count === b.count;
}

/** La valeur de « Aucun » dans la liste des contenants par défaut — jamais un identifiant de bac. */
export const NO_DEFAULT_CONTAINER = '';

/**
 * Les choix du contenant par défaut (2026-10-06) : « Aucun », puis les types
 * en service. Le type déjà réglé reste dans la liste même s'il ne l'était plus
 * — le serveur refuse de l'archiver, mais on ne masque pas ce qui est réglé.
 */
export function defaultContainerOptions(
  types: readonly BinTypeView[],
  current: DeliveryDefaultContainer | null,
): readonly { readonly value: string; readonly label: string }[] {
  const shown = types.filter((type) => type.archivedAt === null || type.id === current?.binTypeId);
  return [
    { value: NO_DEFAULT_CONTAINER, label: 'Aucun — place non vérifiée' },
    ...shown.map((type) => ({ value: type.id, label: type.name })),
  ];
}

/** « 1 × Manne (par défaut) », « Estimée + 1 × Manne (par défaut) » : ce que l’aperçu dit sur l’arrêt. */
export function defaultDemandLabel(
  demand: Pick<DeliveryDefaultDemandView, 'binTypeName' | 'count' | 'withEstimate'>,
): string {
  const container = `${String(demand.count)} × ${demand.binTypeName} (par défaut)`;
  return demand.withEstimate ? `Estimée + ${container}` : container;
}

const UNLOCATED: Readonly<Record<DeliveryUnlocatedReason, string>> = {
  no_address: 'Aucune adresse lisible sur la commande',
  not_geocoded: 'Adresse pas encore située',
};

export function unlocatedReasonLabel(reason: DeliveryUnlocatedReason): string {
  return UNLOCATED[reason];
}

const MODES: Readonly<Record<DeliveryProposalMode, string>> = {
  insert: 'Insérer dans les tournées existantes',
  new_rounds: 'Nouvelles tournées',
};

export function modeLabel(mode: DeliveryProposalMode): string {
  return MODES[mode];
}

/** Les deux modes de « Proposer », pour un `fold-listbox`. */
export const MODE_OPTIONS: readonly {
  readonly value: DeliveryProposalMode;
  readonly label: string;
}[] = [
  { value: 'insert', label: MODES.insert },
  { value: 'new_rounds', label: MODES.new_rounds },
];
