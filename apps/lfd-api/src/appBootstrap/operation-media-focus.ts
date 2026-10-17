import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { RefocusOperationImageCommand } from "../b2b/operations/application/commands/refocus-operation-image.command.js";
import {
  MEDIA_ASSET_DESCRIBED,
  MediaAssetDescribedFact,
} from "../media/channels/carriers/media-asset-described.fact.js";
import { ImageCatalogue } from "../pim/channels/media/image-catalogue.js";
import type { DurableDelivery } from "../platform/outbox/durable-event.js";
import { DurableHandler, type DurableSubscriber } from "../platform/outbox/durable-handler.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const REFOCUS_COMMERCE_OPERATION_IMAGES = "operations.refocus-images";

/**
 * **Le point focal posé à la médiathèque arrive sur l'opération du commerce**
 * — le pendant exact de `RefocusStorefrontOnMediaDescribed` (`mediatheque.md`
 * §7 bis), pour la bannière d'opération (lot 2 de
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`).
 *
 * L'image d'une opération porte bien un point (`catalog_operations.image_focal_x/y`,
 * vérifié le 2026-10-15) : il suit donc, par une COMMANDE — c'est l'agrégat
 * qui recadre.
 *
 * 🔴 Ici, dans `appBootstrap/` : `b2b → media` est hors de la matrice. Durable
 * pour la raison de la vitrine (`lint:durable-cross-block`).
 */
@Injectable()
@DurableHandler({ type: MEDIA_ASSET_DESCRIBED, subscriber: REFOCUS_COMMERCE_OPERATION_IMAGES })
export class RefocusCommerceOperationsOnMediaDescribed implements DurableSubscriber {
  constructor(
    private readonly images: ImageCatalogue,
    private readonly commands: CommandBus,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = MediaAssetDescribedFact.fromPayload(delivery.payload);
    const image = (await this.images.describe([fact.url])).get(fact.url);
    if (image === undefined) {
      return;
    }
    await this.commands.execute<RefocusOperationImageCommand, number>(
      new RefocusOperationImageCommand(fact.url, image.focal),
    );
  }
}
