import { Injectable } from "@nestjs/common";

import {
  MEDIA_ASSET_DESCRIBED,
  MediaAssetDescribedFact,
} from "../../../media/channels/carriers/media-asset-described.fact.js";
import { UuidGenerator } from "../../../platform/id/uuid-generator.js";
import type { DurableDelivery } from "../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../platform/outbox/durable-handler.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { ImageCatalogue } from "../../channels/media/image-catalogue.js";
import { OperationImageUsage } from "../domain/ports/operation-image-usage.js";
import { announceOperationImages } from "./operation-image-announcement.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const REANNOUNCE_OPERATION_MEDIA = "pim.reannounce-operation-media";

/**
 * **L'image d'une opération suit la médiathèque sans republier** (cf.
 * `documentation/mediatheque/mediatheque.md` §7 bis, 2026-10-11).
 *
 * Le commerce garde une COPIE de l'image d'une opération
 * (`catalog_operations.image_*`). Un remplacement A → B repointait le
 * référentiel dans la transaction du geste, mais la copie restait sur A
 * jusqu'au prochain push ; une redescription du point focal, pareil. Cet
 * abonné écoute `media.asset_described` — écrit sur B au remplacement, sur
 * l'image redécrite sinon — et publie, pour chaque opération qui l'affiche,
 * `pim.operation_image_changed` avec l'image d'AUJOURD'HUI : l'URL et
 * l'alternative de l'opération, le point focal de la médiathèque.
 *
 * Le jumeau de `catalogue/product/application/on-media-asset-described.ts`
 * pour les fiches ; deux abonnés plutôt qu'un, parce que deux contextes
 * portent l'image et qu'aucun ne lit l'autre.
 *
 * ## Pourquoi durable
 *
 * `media → pim` traverse un bloc (`lint:durable-cross-block`). Ses annonces
 * s'écrivent dans la transaction de la livraison, avec son reçu.
 *
 * ⚠️ **Il relit l'état d'aujourd'hui**, et chaque annonce tire un geste neuf
 * (UUID v7) : un fait rejoué tard republie l'état courant, et le commerce
 * n'écrit que si le geste est plus récent que celui déjà posé.
 *
 * ⚠️ **Il ne journalise rien** : la médiathèque a tracé la décision.
 */
@Injectable()
@DurableHandler({ type: MEDIA_ASSET_DESCRIBED, subscriber: REANNOUNCE_OPERATION_MEDIA })
export class OnMediaAssetDescribedForOperationsHandler implements DurableSubscriber {
  constructor(
    private readonly usage: OperationImageUsage,
    private readonly images: ImageCatalogue,
    private readonly durable: DurablePublisher,
    private readonly ids: UuidGenerator,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const { url } = MediaAssetDescribedFact.fromPayload(delivery.payload);
    const operations = await this.usage.operationsShowing(url);
    if (operations.length === 0) {
      return;
    }
    // Une image inconnue du fonds (retirée entre-temps) part sans point :
    // l'annonce recadre au centre, comme au push.
    await announceOperationImages(
      { images: this.images, durable: this.durable, ids: this.ids },
      operations,
    );
  }
}
