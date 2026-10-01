import type {
  BillingAddressPayload,
  DeliveryContact,
  DoorstepRule,
  FulfillmentSource,
  GpsPoint,
} from "@lfd/contracts";

import {
  DepartureOrderCancelledError,
  DepartureOrderHeldError,
  DepartureSheetMissingError,
} from "../errors/delivery-loading-errors.js";
import { resolveDoorstepRule } from "../services/doorstep-rule.js";
import type { DeliveryRound } from "./delivery-round.js";

/** La fenêtre convenue, avec sa provenance (`default` n'est pas une promesse). */
export interface DepartureWindow {
  readonly start: string | null;
  readonly end: string;
  readonly source: FulfillmentSource;
}

/**
 * **Ce que verra le livreur à la porte** (plan de tournée, lot 4, L4-C4 et
 * « snapshot au départ ») : adresse livrée, contact, fenêtre, signature, note.
 * **Aucun montant** — un total servi au livreur serait lu comme une somme à
 * encaisser.
 *
 * Lu au commerce par son canal au moment de « Partir », puis FIGÉ : une
 * correction du carnet après le départ ne change plus la feuille d'une
 * camionnette déjà sur la route.
 *
 * ⚠️ **Limite assumée (décidée le 2026-09-29)** : la note livreur de
 * l'ADRESSE est figée (`addressNote`), mais pas la **procédure** (étapes,
 * photos) — le lot 6 la lira en direct. Une procédure corrigée après le
 * départ change donc ce que voit le livreur en route.
 */
export interface DepartureSheet {
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly address: BillingAddressPayload | null;
  readonly contact: DeliveryContact | null;
  readonly window: DepartureWindow | null;
  readonly signatureRequired: boolean;
  /** La note laissée sur la commande. `""` sans note. */
  readonly note: string;
  /**
   * La note livreurs de l'adresse du carnet, lue au départ ; `null` quand la
   * commande n'est pas reliée à une adresse du carnet (sous le mur).
   */
  readonly addressNote: string | null;
  /**
   * « Dépôt autorisé » de l'adresse du carnet reliée, lu sous le même mur que
   * la note ; `false` sans adresse reliée (`plan-a-la-porte.md`, AP-D5).
   */
  readonly depositAllowed: boolean;
  /**
   * La décision réglée d'avance que l'adresse du carnet REDÉFINIT (B3 bis,
   * LB-Q6), lue sous le même mur ; `null` : l'adresse hérite du réglage de
   * la livraison — et toujours `null` sans adresse reliée. Le départ résout.
   */
  readonly doorstepRule: DoorstepRule | null;
  /** Lu, jamais figé : une commande annulée ne part pas. */
  readonly status: "active" | "cancelled";
}

/** Une feuille figée pour UN arrêt d'une tournée partie. */
export interface DepartedStop {
  readonly stopId: string;
  readonly roundId: string;
  readonly serviceDay: string;
  readonly departedAt: Date;
  readonly sheet: DepartureSheet;
  /**
   * Le rang de passage au départ, 1..n (plan « Ma tournée », MT-D5 v2) :
   * `closeStop` resserrera les positions au lot 6, ce rang ne bouge pas.
   */
  readonly departureRank: number;
  /** Le point GPS du carnet au départ, ou `null` : la navigation suit le point promis. */
  readonly gps: GpsPoint | null;
  /**
   * La décision réglée d'avance RÉSOLUE au départ — l'adresse, sinon le
   * réglage global, sinon « Me demander » (B3 bis) —, figée avec l'arrêt.
   */
  readonly doorstepRule: DoorstepRule;
}

/**
 * Fige une feuille par arrêt vivant d'une tournée qui vient de partir, avec
 * son rang de passage et son point GPS (`points`, par commande ; une commande
 * absente n'a pas de point).
 *
 * Une commande que le commerce ne sert plus n'a pas de feuille : on refuse de
 * partir plutôt que d'inventer une adresse, un contact ou une signature.
 *
 * Une commande ANNULÉE entre la composition et le départ ne part pas : le
 * refus la nomme, et dit de retirer l'arrêt.
 *
 * `globalRule` : le réglage global de la décision d'avance à la porte, lu à
 * cet instant (`null` : personne ne l'a posé) ; chaque arrêt fige sa règle
 * résolue (B3 bis).
 *
 * @throws {DepartureOrderCancelledError} @throws {DepartureSheetMissingError}
 */
export function departedStopsOf(
  round: DeliveryRound,
  departedAt: Date,
  sheets: readonly DepartureSheet[],
  points: ReadonlyMap<string, GpsPoint | null>,
  globalRule: DoorstepRule | null,
): readonly DepartedStop[] {
  const byOrder = new Map(sheets.map((sheet) => [sheet.orderId, sheet]));
  const cancelled = round.liveStops.flatMap((stop) => {
    const sheet = byOrder.get(stop.orderId);
    return sheet?.status === "cancelled" ? [sheet.reference] : [];
  });
  if (cancelled.length > 0) {
    throw new DepartureOrderCancelledError(round.vehicleName, cancelled);
  }
  return round.liveStops.map((stop, index) => {
    const sheet = byOrder.get(stop.orderId);
    if (sheet === undefined) {
      throw new DepartureSheetMissingError(round.vehicleName, stop.orderId);
    }
    return {
      stopId: stop.id,
      roundId: round.id,
      serviceDay: round.serviceDay,
      departedAt,
      sheet,
      departureRank: index + 1,
      gps: points.get(stop.orderId) ?? null,
      doorstepRule: resolveDoorstepRule(globalRule, sheet.doorstepRule),
    };
  });
}

/**
 * Refuse le départ si un arrêt vivant porte une commande retenue au contrôle
 * qualité (`plan-a-la-porte.md`, § 10 ter, BQ — LB-Q1 : une tournée partie ne
 * se contrôle plus). L'arrêt est nommé par sa référence et son client, ce que
 * le dépôt et le livreur lisent l'un et l'autre.
 *
 * @throws {DepartureOrderHeldError}
 */
export function refuseHeldOrders(
  round: DeliveryRound,
  sheets: readonly DepartureSheet[],
  held: ReadonlySet<string>,
): void {
  const byOrder = new Map(sheets.map((sheet) => [sheet.orderId, sheet]));
  const named = round.liveStops
    .filter((stop) => held.has(stop.orderId))
    .map((stop) => stopLabel(stop.orderId, byOrder.get(stop.orderId)));
  if (named.length > 0) {
    throw new DepartureOrderHeldError(round.vehicleName, named);
  }
}

function stopLabel(orderId: string, sheet: DepartureSheet | undefined): string {
  if (sheet === undefined) {
    return orderId;
  }
  return sheet.customerLabel === ""
    ? sheet.reference
    : `${sheet.reference} (${sheet.customerLabel})`;
}
