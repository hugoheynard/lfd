import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import {
  PRODUCTION_PACKING_LIST_DRAWN,
  PackingListDrawnEvent,
} from "../../../production/channels/packing/index.js";
import { PackingSettings } from "../../domain/entities/packing-settings.js";
import {
  type PackingTrackingLevel,
  trackingLevelSourceOf,
} from "../../domain/entities/packing-tracking-level.js";
import { OriginTrackingLevelReader } from "../../domain/ports/origin-tracking-level.reader.js";
import { PackingSettingsReader } from "../../domain/ports/packing-settings.reader.js";
import { PackingShadowLedger } from "../../domain/ports/packing-shadow.ledger.js";
import { linesBySku } from "../../domain/services/lines-by-sku.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_PACKING_LIST_DRAWN = "packing.shadow.draw-list";

/**
 * **Une commande entre dans la liste à coliser de l'ombre** (plan
 * `colisage/colisage.md`, K1, §11 B1–B2).
 *
 * Inscrite si elle n'y est pas, jamais réécrite : la réannonce et le rejeu
 * republient le même instantané, et une commande déjà là ne bouge pas. Une
 * remise arrivée avant elle attend déjà dans la réserve — rien à rattraper ici.
 *
 * Le niveau de suivi s'y fige (plan des niveaux de suivi du colisage, D3) :
 * le réglage pour un retrait, celui de la fiche d'origine pour un reliquat,
 * rien pour une livraison. L'arrêt et le retirage passent tous deux par ce
 * fait. Une fiche déjà inscrite garde le sien.
 */
@Injectable()
@DurableHandler({ type: PRODUCTION_PACKING_LIST_DRAWN, subscriber: ON_PACKING_LIST_DRAWN })
export class OnPackingListDrawn implements DurableSubscriber {
  constructor(
    private readonly shadow: PackingShadowLedger,
    private readonly settings: PackingSettingsReader,
    private readonly origins: OriginTrackingLevelReader,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = PackingListDrawnEvent.fromPayload(delivery.payload);
    const trackingLevel = await this.trackingLevelOf(event);
    await this.shadow.drawOrder({
      serviceDay: event.serviceDay,
      orderId: event.order.orderId,
      rank: event.order.rank,
      reference: event.order.reference,
      customerLabel: event.order.customerLabel,
      fulfillmentMethod: event.order.fulfillmentMethod,
      dueAt: event.order.dueAt,
      clientele: event.order.clientele,
      siteId: event.order.siteId,
      drawnAt: event.drawnAt,
      // K2b : la colonne Contenants s'ouvre pour toute commande inscrite
      // désormais ; les commandes déjà inscrites restent `counted`.
      containerMode: "listed",
      trackingLevel,
      lines: linesBySku(event.order.lines),
    });
  }

  private async trackingLevelOf(
    event: PackingListDrawnEvent,
  ): Promise<PackingTrackingLevel | null> {
    switch (trackingLevelSourceOf(event.order)) {
      case "none":
        return null;
      case "setting":
        return ((await this.settings.current()) ?? PackingSettings.defaults()).pickupTrackingLevel;
      case "origin":
        return this.origins.originLevelOf(event.order.orderId, event.serviceDay);
    }
  }
}
