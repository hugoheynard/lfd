import type {
  DeliveryRoundDriverView,
  DeliveryRoundPlaceStatus,
  DeliveryRoundTimingView,
  DeliveryRunSheetStopView,
} from '@lfd/contracts';

import type { PlannedTiming } from './delivery-planning';
import {
  type ComposedDay,
  type ComposedRound,
  type ListSlot,
  signalLabel,
  type WindowBounds,
  windowClashes,
} from './delivery-rounds';

export * from './rounds-board-labels';
export * from './rounds-board-map';

/**
 * Le tableau de l'organisateur de tournées
 * (`handoff-tournees/SPEC.md`) : « À répartir », les tournées, et ce que la
 * carte en montre — le même modèle pour la composition enregistrée et pour
 * l'aperçu d'une proposition, pour qu'un seul écran serve les deux.
 *
 * Type-only sur le contrat, comme `delivery-rounds.ts` : une valeur importée
 * de `@lfd/contracts` tirerait zod dans le paquet de la page.
 */

/** Le nom de la liste « À répartir » parmi les listes du tableau — jamais un identifiant de tournée. */
export const POOL_KEY = '__pool__';

/**
 * Pourquoi le calcul a laissé une commande à répartir (aperçu seulement) :
 * sans point GPS, plus de passage permis, la place (CA4) — aucune caisse
 * ne la tient (`capacity`) —, ou aucun véhicule autorisé sur sa zone
 * (`zone`, 2026-10-06). Une commande aux bacs inconnus n'y est plus : elle
 * est placée, et sa tournée dit « place non vérifiée » (2026-10-06).
 */
export type BoardReason = 'unlocated' | 'overflow' | 'capacity' | 'zone';

/** Une commande à répartir. */
export interface BoardOrder {
  readonly orderId: string;
  readonly reference: string;
  readonly sheet: DeliveryRunSheetStopView | null;
  readonly broughtBackAt: string | null;
  readonly reason: BoardReason | null;
}

/** Un arrêt d'une tournée du tableau. */
export interface BoardStop {
  readonly orderId: string;
  /** `null` : l'arrêt n'existe pas encore en base (aperçu, ou geste en vol). */
  readonly stopId: string | null;
  readonly reference: string;
  readonly sheet: DeliveryRunSheetStopView | null;
  readonly window: WindowBounds | null;
  /** C8 : la référence de l'arrêt placé avant et qui fait arriver trop tard. */
  readonly windowClash: string | null;
  /** Ce qui cloche, en toutes lettres (Q11). */
  readonly signals: readonly string[];
  readonly broughtBackAt: string | null;
  /** Placé là par le calcul — en bleu dans l'aperçu. */
  readonly proposed: boolean;
  /** Le calcul l'y fait arriver après son créneau. */
  readonly windowMissed: boolean;
  /**
   * 🔴 L'alerte rouge (CA5, §9) — composition enregistrée seulement : à cette
   * place, l'échéance ne tient pas, alors que livrée seule elle tiendrait. Le
   * geste du bureau l'emporte : le calcul ne la déplace pas, il la nomme.
   */
  readonly placementLate: boolean;
  /**
   * Aperçu seulement : la demande de la commande vient du contenant par défaut
   * des réglages (2026-10-06) — « 1 × Manne (par défaut) ». `null` sinon.
   */
  readonly defaultDemand: string | null;
  /**
   * Composition enregistrée seulement : le véhicule n'est pas autorisé sur la
   * zone de la commande (2026-10-06). Posée avant la restriction, ou glissée
   * à la main : dit, jamais défait.
   */
  readonly outOfZone: boolean;
}

/** Une tournée du tableau — enregistrée, ou à ouvrir dans l'aperçu. */
export interface BoardRound {
  readonly key: string;
  readonly roundId: string | null;
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly departedAt: string | null;
  readonly returnedAt: string | null;
  /** Partie, ou chargée dans l'aperçu : rien ne s'y dépose, rien n'en sort (I6). */
  readonly frozen: boolean;
  readonly vehicleRetired: boolean;
  readonly driver: DeliveryRoundDriverView | null;
  readonly geometry: readonly (readonly [number, number])[] | null;
  /**
   * Départ, retour et distance estimés — dans l'aperçu seulement. Une tournée
   * enregistrée n'en porte pas : `DeliveryRoundView` ne les sert pas (vérifié
   * le 2026-10-06), et `null` aussi tant qu'une colonne attend son chronométrage.
   */
  readonly timing: PlannedTiming | null;
  /**
   * Combien de ses arrêts n'ont pas de bacs connus — aperçu seulement : la
   * proposition les place sans contrôler leur place (2026-10-06), donc la
   * tournée n'a pas de place vérifiée tant que ce compte n'est pas nul.
   */
  readonly unknownDemand: number;
  /**
   * La place du véhicule pour une tournée ENREGISTRÉE au dépôt (2026-10-07),
   * ou `null` : partie, ou aperçu (« Proposer » ne place que ce qui tient).
   * Un avertissement, jamais un refus.
   */
  readonly place: DeliveryRoundPlaceStatus | null;
  readonly stops: readonly BoardStop[];
}

/** Un geste du glisser : la commande, d'où elle part, où elle tombe. */
export interface BoardDrop {
  readonly orderId: string;
  readonly from: ListSlot;
  readonly to: ListSlot;
}

export interface Board {
  readonly rounds: readonly BoardRound[];
  readonly pool: readonly BoardOrder[];
}

/** Les tracés connus, par clé de tournée. */
export type Geometries = ReadonlyMap<string, readonly (readonly [number, number])[]>;

/** Ce que le chronométrage de la composition enregistrée en dit : tracés et alertes rouges (CA5). */
export interface ComposedTiming {
  readonly geometries: Geometries;
  /** Les commandes que leur place rend intenables. */
  readonly placementLate: ReadonlySet<string>;
}

export const NO_TIMING: ComposedTiming = { geometries: new Map(), placementLate: new Set() };

/** Le chronométrage des tournées `timed`, rendu dans le même ordre, lu pour le tableau. */
export function composedTimingOf(
  timed: readonly { readonly id: string }[],
  view: DeliveryRoundTimingView,
): ComposedTiming {
  return {
    geometries: new Map(
      timed.flatMap((round, index) => {
        const geometry = view.rounds[index]?.geometry ?? null;
        return geometry === null ? [] : [[round.id, geometry] as const];
      }),
    ),
    placementLate: new Set(
      view.rounds.flatMap((round) =>
        round.stops.filter((stop) => stop.placementLate).map((stop) => stop.orderId),
      ),
    ),
  };
}

/** Recalcule les fenêtres intenables (C8) d'une liste d'arrêts, dans son ordre. */
export function withClashes(stops: readonly BoardStop[]): readonly BoardStop[] {
  const clashes = windowClashes(stops);
  return stops.map((stop, index) => ({ ...stop, windowClash: clashes[index] ?? null }));
}

function roundOfComposed(composed: ComposedRound, timing: ComposedTiming): BoardRound {
  const { round } = composed;
  return {
    key: round.id,
    roundId: round.id,
    vehicleId: round.vehicleId,
    vehicleName: round.vehicleName,
    passage: round.passage,
    departedAt: round.departedAt,
    returnedAt: round.returnedAt,
    frozen: round.departedAt !== null,
    vehicleRetired: round.vehicleRetired,
    driver: round.driver,
    geometry: timing.geometries.get(round.id) ?? null,
    timing: null,
    unknownDemand: round.place?.unknownOrders ?? 0,
    place: round.place?.status ?? null,
    stops: composed.stops.map(({ stop, sheet, windowClash }) => ({
      orderId: stop.orderId,
      stopId: stop.stopId,
      reference: stop.reference,
      sheet,
      window: sheet?.window ?? null,
      windowClash,
      signals: stop.signals.map((signal) => signalLabel(signal, stop.orderDay)),
      broughtBackAt: stop.broughtBackAt ?? null,
      proposed: false,
      windowMissed: false,
      placementLate: timing.placementLate.has(stop.orderId),
      defaultDemand: null,
      outOfZone: stop.outOfZone === true,
    })),
  };
}

/** La composition enregistrée, telle que le tableau la montre. */
export function boardOfComposed(composed: ComposedDay, timing: ComposedTiming = NO_TIMING): Board {
  return {
    rounds: composed.rounds.map((round) => roundOfComposed(round, timing)),
    pool: composed.unassigned.map(({ order, sheet }) => ({
      orderId: order.orderId,
      reference: order.reference,
      sheet,
      broughtBackAt: order.broughtBackAt ?? null,
      reason: null,
    })),
  };
}

/** Ce qui est à régler dans une tournée : fenêtres intenables et signaux (Q11). */
export function alertCountOf(round: BoardRound): number {
  return round.stops.reduce(
    (count, stop) =>
      count +
      stop.signals.length +
      (stop.windowClash === null ? 0 : 1) +
      (stop.placementLate ? 1 : 0),
    0,
  );
}

/** Les tournées d'un véhicule, dans l'ordre servi. */
export interface VehicleGroup {
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly rounds: readonly BoardRound[];
}

/**
 * Un groupe par véhicule, dans l'ordre de leur première tournée ; ses
 * passages dans l'ordre où ils partent — l'aperçu met les tournées proposées
 * avant celles qu'il garde.
 */
export function vehicleGroupsOf(rounds: readonly BoardRound[]): readonly VehicleGroup[] {
  const groups = new Map<string, BoardRound[]>();
  for (const round of rounds) {
    const group = groups.get(round.vehicleId);
    if (group === undefined) {
      groups.set(round.vehicleId, [round]);
    } else {
      group.push(round);
    }
  }
  return [...groups.entries()].map(([vehicleId, members]) => ({
    vehicleId,
    vehicleName: members[0]?.vehicleName ?? '',
    rounds: [...members].sort((a, b) => a.passage - b.passage),
  }));
}

/**
 * Où tombe une commande lâchée sur l'onglet d'un véhicule : à la fin de son
 * DERNIER passage encore en préparation — `null` s'il n'en a aucun.
 */
export function dropTargetOf(rounds: readonly BoardRound[], vehicleId: string): BoardRound | null {
  return (
    rounds
      .filter((round) => round.vehicleId === vehicleId && !round.frozen)
      .sort((a, b) => a.passage - b.passage)
      .at(-1) ?? null
  );
}
