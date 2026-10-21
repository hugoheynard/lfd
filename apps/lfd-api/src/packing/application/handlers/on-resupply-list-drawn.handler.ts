import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import {
  PRODUCTION_RESUPPLY_LIST_DRAWN,
  ResupplyListDrawnEvent,
} from "../../../production/channels/packing/index.js";
import { PackingResupplyListing } from "../../domain/ports/packing-resupply-listing.js";
import { linesBySku } from "../../domain/services/lines-by-sku.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_RESUPPLY_LIST_DRAWN = "packing.draw-resupply";

/**
 * **Un réassort entre au colisage** (réassort, lot R3b,
 * `reassort-boutiques/plan-reapprovisionnement.md` §13.1 point 5) : sa fiche
 * s'ouvre, à part des commandes, titrée « Réassort <point> ».
 *
 * Le fournil ne publie que le réassort d'un point servi par transfert (§13.4,
 * Q1 révisée) ; l'abonné inscrit ce qu'il reçoit. Inscrite si elle n'y est
 * pas, jamais réécrite : la réannonce et le rejeu republient le même figé.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_RESUPPLY_LIST_DRAWN, subscriber: ON_RESUPPLY_LIST_DRAWN })
export class OnResupplyListDrawn implements DurableSubscriber {
  constructor(private readonly listing: PackingResupplyListing) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = ResupplyListDrawnEvent.fromPayload(delivery.payload);
    await this.listing.draw({
      serviceDay: event.serviceDay,
      resupplyId: event.resupply.resupplyId,
      siteId: event.resupply.siteId,
      siteLabel: event.resupply.siteLabel,
      drawnAt: event.drawnAt,
      lines: linesBySku(event.resupply.lines),
    });
  }
}
