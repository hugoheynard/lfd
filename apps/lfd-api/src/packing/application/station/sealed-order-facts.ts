import type { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import {
  PackingOrderPackedEvent,
  PackingShortfallClearedEvent,
} from "../../channels/commerce/index.js";
import type { PackingSheet, SheetMark } from "../../domain/entities/packing-sheet.js";

/** Ce que `PackingSheet.seal` rend : la signature, et si la fermeture est neuve. */
export interface SealedSheet {
  readonly mark: SheetMark;
  readonly fresh: boolean;
}

/**
 * **Les faits d'une fiche fermée** — « Déclarer prête » et « Tout est prêt »
 * publient la même chose, dans la transaction de la fermeture :
 *
 * - `packing.order_packed`, sous la clé de la commande ; une fermeture qui
 *   n'est pas neuve est une réannonce (`republishedAt` = maintenant), que le
 *   commerce reçoit sans rien refaire ;
 * - `packing.shortfall_cleared`, seulement sur une fermeture neuve d'une
 *   fiche dont un manque était signalé : fermée complète, il n'a plus lieu
 *   d'être.
 *
 * `signalled` se lit AVANT `seal`, qui efface le signal.
 */
export async function publishSealedOrder(
  durable: DurablePublisher,
  sheet: PackingSheet,
  sealed: SealedSheet,
  signalled: boolean,
  now: Date,
): Promise<void> {
  await durable.publish(
    new PackingOrderPackedEvent(
      sheet.orderId,
      sheet.rank,
      sheet.reference,
      sealed.mark.at,
      sealed.mark.by,
      sealed.fresh ? null : now,
    ).durableFact(),
  );
  if (sealed.fresh && signalled) {
    await durable.publish(
      new PackingShortfallClearedEvent(
        sheet.orderId,
        sheet.rank,
        sheet.reference,
        now,
      ).durableFact(),
    );
  }
}
