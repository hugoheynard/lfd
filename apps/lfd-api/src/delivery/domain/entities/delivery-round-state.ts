/**
 * **L'état d'une tournée** — ce que `DeliveryRound.restore` réhydrate et ce que
 * `toSnapshot` rend. Sorti de `delivery-round.ts` le 2026-10-01 pour tenir
 * l'agrégat sous sa taille ; il y est ré-exporté.
 */

import { FIRST_SHIPMENT_RANK, ShipmentRef } from "../../../production/channels/delivery/index.js";
import type { GesturePosition } from "../value-objects/gesture-position.js";
import type { PlannedTiming } from "../value-objects/planned-timing.js";

/**
 * Un arrêt tel que la tournée le connaît. `closedAt` non nul = clos (livré ou
 * raté, lot 6) : il n'est plus vivant, garde sa position figée, et se
 * réécrit tel quel.
 */
export type DeliveryStopState = DetachedStop & {
  readonly position: number;
  readonly closedAt: Date | null;
  /**
   * La position relevée au geste qui vient de clore l'arrêt (YA-D4).
   * **Présente seulement dans l'écriture de CE geste** : un arrêt
   * réhydraté ne la porte pas (absente), et l'adaptateur n'écrit les colonnes
   * de position que lorsqu'elle est présente — un `save` ultérieur ne peut donc
   * ni réécrire une position que la purge a effacée, ni l'effacer lui-même.
   */
  readonly closedPosition?: GesturePosition;
};

/** Un arrêt retiré pendant cette écriture : la ligne reste, `removedAt` posé. */
export type RemovedStopState = DeliveryStopState & {
  readonly removedAt: Date;
};

/**
 * **Le retour au dépôt** (`parcours-du-livreur.md`, PL2) : quand, et qui l'a
 * déclaré — le nom figé au geste, `""` quand l'annuaire n'en connaissait pas.
 */
export interface RoundReturn {
  readonly at: Date;
  readonly byStaffId: string;
  readonly byName: string;
}

/** L'état persisté d'une tournée — ce que `toDomain` réhydrate. Arrêts non retirés seulement. */
export interface DeliveryRoundState {
  readonly id: string;
  readonly serviceDay: string;
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly version: number;
  /** Partie le (lot 4, L4-C4), ou `null` : au dépôt. */
  readonly departedAt: Date | null;
  /** Le livreur affecté (plan « Ma tournée », MT-D2), l'id d'une fiche staff ; `null` : aucun. */
  readonly driverStaffId: string | null;
  /**
   * Rentrée (PL2), ou `null` : elle roule encore, ou n'est pas partie.
   * Facultatif à la RÉHYDRATATION seulement — absent vaut `null` ; le
   * dépôt Prisma le passe toujours, et `toSnapshot` le rend toujours.
   */
  readonly returned?: RoundReturn | null;
  /**
   * L'horaire prévu (I10), ou `null`. Facultatif à la RÉHYDRATATION seulement,
   * comme `returned` — absent vaut `null`.
   */
  readonly plannedTiming?: PlannedTiming | null;
  /**
   * Supprimée le (décision de Hugo, 2026-10-26), ou `null`. Facultatif à la
   * RÉHYDRATATION seulement, comme `returned` — absent vaut `null`.
   */
  readonly removedAt?: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly stops: readonly DeliveryStopState[];
}

/** Ce que l'adaptateur écrit : l'état, plus les arrêts retirés par ce geste. */
export interface DeliveryRoundSnapshot extends DeliveryRoundState {
  readonly removedStops: readonly RemovedStopState[];
}

/**
 * **Ce qu'un arrêt dessert** (plan du transfert interne, §4, lot T1) : une
 * commande livrée, ou le passage d'un transfert interne à son site. L'union
 * est le mécanisme qui rend l'inventaire complet : un lecteur qui lit
 * `orderId` sans tester `kind` ne compile pas.
 */
export type StopSubject =
  | {
      readonly kind: "order";
      readonly orderId: string;
      /**
       * Le rang de l'envoi desservi (plan E7 reliquat, L3c) : 1 = la commande
       * elle-même. Absent = 1, comme un fait écrit avant le rang
       * (`shipmentRankOf`) ; l'adaptateur le pose toujours.
       */
      readonly shipmentRank?: number;
    }
  | { readonly kind: "transfer"; readonly transferId: string };

/** Un arrêt vivant, détaché d'une tournée pour entrer dans une autre (I7). */
export type DetachedStop = StopSubject & { readonly id: string };

/** La commande d'un arrêt de commande ; `null` pour un arrêt de transfert. */
export function orderIdOf(stop: StopSubject): string | null {
  return stop.kind === "order" ? stop.orderId : null;
}

/** Les commandes d'arrêts de commande, dans l'ordre donné. */
export function orderIdsOf(stops: readonly StopSubject[]): readonly string[] {
  return stops.flatMap((stop) => (stop.kind === "order" ? [stop.orderId] : []));
}

/** Le rang de l'envoi d'un arrêt de commande — absent = 1. */
export function shipmentRankOfStop(stop: Extract<StopSubject, { readonly kind: "order" }>): number {
  return stop.shipmentRank ?? FIRST_SHIPMENT_RANK;
}

/** Les envois des arrêts de commande, dans l'ordre donné. */
export function shipmentsOfStops(stops: readonly StopSubject[]): readonly ShipmentRef[] {
  return stops.flatMap((stop) =>
    stop.kind === "order" ? [ShipmentRef.of(stop.orderId, shipmentRankOfStop(stop))] : [],
  );
}

/** Deux arrêts desservent-ils la même chose ? Un envoi = commande ET rang. */
export function sameSubject(a: StopSubject, b: StopSubject): boolean {
  return a.kind === "order"
    ? b.kind === "order" &&
        a.orderId === b.orderId &&
        shipmentRankOfStop(a) === shipmentRankOfStop(b)
    : b.kind === "transfer" && a.transferId === b.transferId;
}

/** Les arrêts de commande seulement, typés comme tels — un arrêt de transfert n'a pas de commande. */
export function orderStopsOf<T extends StopSubject>(
  stops: readonly T[],
): readonly Extract<T, { readonly kind: "order" }>[] {
  return stops.filter(
    (stop): stop is Extract<T, { readonly kind: "order" }> => stop.kind === "order",
  );
}

/** Les arrêts de transfert seulement. */
export function transferStopsOf<T extends StopSubject>(
  stops: readonly T[],
): readonly Extract<T, { readonly kind: "transfer" }>[] {
  return stops.filter(
    (stop): stop is Extract<T, { readonly kind: "transfer" }> => stop.kind === "transfer",
  );
}
