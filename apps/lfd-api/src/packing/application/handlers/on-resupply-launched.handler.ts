import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  PRODUCTION_RESUPPLY_LAUNCHED,
  ResupplyLaunchedEvent,
} from "../../../production/channels/packing/index.js";
import { PackingResupplyListing } from "../../domain/ports/packing-resupply-listing.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";
import { linesBySku } from "../../domain/services/lines-by-sku.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_RESUPPLY_LAUNCHED = "packing.draw-launched-resupply";

/**
 * **Un réassort « au plus tôt » lancé entre au colisage** (réassort, lot R4b —
 * `reassort-boutiques/plan-au-plus-tot.md` §2 ③, Q7). Seulement s'il part par
 * transfert : celui du Labo va de la feuille à la vitrine (« Monté »).
 *
 * Deux gestes, dans l'unité de travail du reçu :
 * 1. la fiche s'inscrit, genre `asap` — la même que le soir (R3b), titrée
 *    « … · au plus tôt » et en tête du poste ;
 * 2. chaque ligne RÉSERVE ses pièces sur la réserve `(jour, SKU)`, sous son
 *    verrou, dans l'ordre des SKU — celui de « Proposer ». La réserve ne prend
 *    rien au bac : si le four n'a pas encore remis assez, la fiche est « en
 *    attente du four » et les remises suivantes la servent avant les
 *    commandes.
 *
 * Ordre des verrous : la fiche (insérée), puis les réserves — celui de la
 * saisie. Inscrite si absente, réservée si non réservée : le rejeu ne double
 * rien, même après la clôture.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_RESUPPLY_LAUNCHED, subscriber: ON_RESUPPLY_LAUNCHED })
export class OnResupplyLaunched implements DurableSubscriber {
  constructor(
    private readonly listing: PackingResupplyListing,
    private readonly stocks: PackingStockRepository,
    private readonly clock: Clock,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ResupplyLaunchedEvent.fromPayload(delivery.payload);
    if (!event.resupply.servedByTransfer) {
      return;
    }
    const lines = [...linesBySku(event.resupply.lines)].sort((a, b) => a.sku.localeCompare(b.sku));
    await this.listing.draw({
      serviceDay: event.serviceDay,
      resupplyId: event.resupply.resupplyId,
      siteId: event.resupply.siteId,
      siteLabel: event.resupply.siteLabel,
      name: event.resupply.name,
      kind: "asap",
      drawnAt: event.launchedAt,
      lines,
    });
    const at = this.clock.now();
    for (const line of lines) {
      const stock = await this.stocks.lock(event.serviceDay, line.sku);
      if (stock.reserve(event.resupply.resupplyId, line.quantity, at)) {
        await this.stocks.save(stock);
      }
    }
  }
}
