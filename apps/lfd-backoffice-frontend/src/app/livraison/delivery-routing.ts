import type {
  ApplyDeliveryProposalPayload,
  DeliveryKeptRoundReason,
  DeliveryProposalMode,
  DeliveryProposalWindow,
  DeliveryRoundProposalView,
  DeliveryRoutingSettingsPayload,
  DeliveryUnlocatedReason,
} from '@lfd/contracts';

import { timeLabel } from './run-sheet';

/**
 * Les dérivations pures du calculateur de tournée
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 7).
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
  return window.start === null
    ? `fenêtre avant ${timeLabel(window.end)}`
    : `fenêtre ${timeLabel(window.start)} – ${timeLabel(window.end)}`;
}

/** Le facteur de détour tel qu'on le lit : 140 → 1,4. */
export function detourFactorOf(percent: number): number {
  return percent / PERCENT;
}

/** Le facteur saisi, rendu en centièmes pour le contrat : 1,4 → 140. */
export function detourPercentOf(factor: number): number {
  return Math.round(factor * PERCENT);
}

/** « ×1,4 », « ×1,35 ». */
export function detourLabel(percent: number): string {
  return `×${detourFactorOf(percent).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`;
}

/**
 * Ce que valent les heures d'une proposition (lot 8, L8-C3) : par la route
 * quand le calcul routier a répondu, à vol d'oiseau sinon — et l'écran le
 * dit, jamais une proposition routière annoncée qui n'en est pas une.
 *
 * Ne lit que l'estimation et les réglages : le simulateur (lot 9) les a sans
 * avoir de journée, et dit la même phrase.
 */
export function estimateLabel(
  proposal: Pick<DeliveryRoundProposalView, 'estimate'> & {
    readonly settings: Pick<DeliveryRoutingSettingsPayload, 'detourPercent' | 'averageSpeedKmh'>;
  },
): string {
  if (proposal.estimate === 'road') {
    return 'Durées par la route (carte de la Savoie) : les heures restent indicatives, pas des promesses.';
  }
  const { detourPercent, averageSpeedKmh } = proposal.settings;
  return `Estimation à vol d’oiseau (${detourLabel(detourPercent)}, ${String(averageSpeedKmh)} km/h) — le calcul routier ne répond pas ou n’est pas branché : les heures et les durées sont indicatives, pas des promesses.`;
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
    a.defaultMode === b.defaultMode &&
    a.multiplePassages === b.multiplePassages
  );
}

const UNLOCATED: Readonly<Record<DeliveryUnlocatedReason, string>> = {
  no_address: 'Aucune adresse lisible sur la commande',
  not_geocoded: 'Adresse pas encore située',
};

export function unlocatedReasonLabel(reason: DeliveryUnlocatedReason): string {
  return UNLOCATED[reason];
}

const KEPT: Readonly<Record<DeliveryKeptRoundReason, string>> = {
  departed: 'Déjà partie',
  loaded: 'Un sac y est chargé',
  unlocated_stop: 'Un de ses arrêts n’est pas situé',
  signaled_stop: 'Un de ses arrêts est signalé',
  not_requested: 'Non demandée — véhicule décoché, ou composée à la main sans « Tout recomposer »',
  unchanged: 'Rien à y insérer',
};

export function keptReasonLabel(reason: DeliveryKeptRoundReason): string {
  return KEPT[reason];
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

/**
 * Ce qu'« Appliquer » renvoie : la proposition TELLE QU'ON L'A VUE — chaque
 * tournée avec la liste complète de ses commandes dans l'ordre, et les
 * versions de toutes les tournées lues (L7-C6). Rien n'est recalculé ici.
 */
export function applyPayloadOf(proposal: DeliveryRoundProposalView): ApplyDeliveryProposalPayload {
  return {
    day: proposal.day,
    rounds: proposal.rounds.map((round) => ({
      roundId: round.roundId,
      vehicleId: round.vehicleId,
      orderIds: round.stops.map((stop) => stop.orderId),
    })),
    versions: proposal.versions.map(({ roundId, version }) => ({ roundId, version })),
  };
}
