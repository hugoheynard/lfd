import type { BillingAddressPayload, DeliveryContact, FulfillmentSource } from "@lfd/contracts";

import {
  DepartureOrderCancelledError,
  DepartureSheetMissingError,
} from "../errors/delivery-loading-errors.js";
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
}

/**
 * Fige une feuille par arrêt vivant d'une tournée qui vient de partir.
 *
 * Une commande que le commerce ne sert plus n'a pas de feuille : on refuse de
 * partir plutôt que d'inventer une adresse, un contact ou une signature.
 *
 * Une commande ANNULÉE entre la composition et le départ ne part pas : le
 * refus la nomme, et dit de retirer l'arrêt.
 *
 * @throws {DepartureOrderCancelledError} @throws {DepartureSheetMissingError}
 */
export function departedStopsOf(
  round: DeliveryRound,
  departedAt: Date,
  sheets: readonly DepartureSheet[],
): readonly DepartedStop[] {
  const byOrder = new Map(sheets.map((sheet) => [sheet.orderId, sheet]));
  const cancelled = round.liveStops.flatMap((stop) => {
    const sheet = byOrder.get(stop.orderId);
    return sheet?.status === "cancelled" ? [sheet.reference] : [];
  });
  if (cancelled.length > 0) {
    throw new DepartureOrderCancelledError(round.vehicleName, cancelled);
  }
  return round.liveStops.map((stop) => {
    const sheet = byOrder.get(stop.orderId);
    if (sheet === undefined) {
      throw new DepartureSheetMissingError(round.vehicleName, stop.orderId);
    }
    return { stopId: stop.id, roundId: round.id, serviceDay: round.serviceDay, departedAt, sheet };
  });
}
