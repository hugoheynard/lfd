import { Injectable } from "@nestjs/common";

import {
  HANDOVER_HANDED_OVER,
  OrderHandedOverEvent,
} from "../../../handover/channels/packing/index.js";
import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { PackingSheetRepository } from "../../domain/ports/packing-sheet.repository.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_ORDER_HANDED_OVER = "packing.leave-handed-over-sheet";

/**
 * **Un envoi remis sort de la liste à coliser** (Hugo, 2026-11-03, option b ;
 * plan `documentation/commandes/reliquat/depart-incomplet.md`, §7).
 *
 * Une commande remise au comptoir sans être colisée laissait sa fiche ouverte
 * au poste ; fermer le bac ensuite publiait `packing.order_packed`, que le
 * commerce refusait (« déjà retirée ») — en message mort sur la carte de
 * santé. Le trou valait pour toute remise d'un envoi pas colisé, départ
 * incomplet du comptoir compris.
 *
 * La fiche la plus récente de l'envoi (rang par rang), sous verrou, dans la
 * transaction du reçu ; l'agrégat décide (`PackingSheet.leaveAtHandover`) :
 * retirée si rien n'est au bac, fermée telle quelle sinon. Signée par le
 * retrait — son instant et son auteur, ceux du FAIT.
 *
 * Sans effet, donc idempotent : pas de fiche (la liste ne l'a pas inscrite),
 * fiche déjà retirée, bac déjà fermé — le cas de toute remise ordinaire.
 *
 * @sans-journal le retrait est l'acte, journalisé par le commerce
 * (`order.fulfilled`) ; le journal n'a pas de type pour ce rangement, et on ne
 * l'invente pas ici.
 */
@Injectable()
@DurableHandler({ type: HANDOVER_HANDED_OVER, subscriber: ON_ORDER_HANDED_OVER })
export class OnOrderHandedOver implements DurableSubscriber {
  constructor(private readonly sheets: PackingSheetRepository) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderHandedOverEvent.fromPayload(delivery.payload);
    const sheet = await this.sheets.lockLatestOf(event.orderId, event.rank);
    if (sheet === null || sheet.withdrawnAt !== null) {
      return;
    }
    const outcome = sheet.leaveAtHandover({ at: event.handedOverAt, by: event.handedOverBy });
    if (outcome !== "unchanged") {
      await this.sheets.save(sheet);
    }
  }
}
