import { Injectable } from "@nestjs/common";

import {
  MEDIA_ASSET_DESCRIBED,
  MediaAssetDescribedFact,
} from "../../../../media/channels/carriers/media-asset-described.fact.js";
import { UuidGenerator } from "../../../../platform/id/uuid-generator.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { EditorialReader } from "../domain/ports/editorial-reader.js";
import { ProductImageUsage } from "../domain/ports/product-image-usage.js";
import { announceProductMedia, SHOWCASED_ROLES } from "./product-media-announcement.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const REANNOUNCE_PRODUCT_MEDIA = "pim.reannounce-product-media";

/**
 * **Le point focal posé à la médiathèque arrive en boutique sans republier**
 * (L4 de `documentation/mediatheque/plan-la-mediatheque-amelioree.md`,
 * 2026-10-10).
 *
 * La vitrine garde une COPIE des visuels d'une fiche — URL, alternative,
 * dimensions, point focal. Redécrire une image à la médiathèque ne la
 * touchait pas : il fallait réenregistrer la fiche ou pousser le catalogue.
 * Cet abonné écoute le fait que la médiathèque déclare dans son canal vers
 * les porteurs, et réannonce chaque fiche qui montre l'image sous un rôle
 * qui traverse — par le MÊME fait que l'enregistrement de la section
 * (`pim.product_media_changed`), composé par la même fonction.
 *
 * ## Pourquoi durable
 *
 * `media → pim` traverse un bloc : en mémoire, un redémarrage entre la
 * description et la réannonce laisserait la boutique sur l'ancien cadrage
 * sans que personne le sache (`lint:durable-cross-block`). Ses annonces
 * s'écrivent dans la transaction de la livraison, avec son reçu : elles
 * tiennent ou tombent ensemble, et un échec fait rejouer.
 *
 * ⚠️ **Il relit l'état d'aujourd'hui**, pas celui du geste : un fait rejoué
 * tard republie la description courante, et chaque annonce tire un geste
 * neuf, donc plus récent que tout ce que la projection a déjà posé.
 *
 * ⚠️ **Il ne journalise rien.** La médiathèque a inscrit la décision
 * (`media_asset.described`) ; une fiche dont l'image a été recadrée n'a pas
 * été modifiée par qui l'affiche.
 */
@Injectable()
@DurableHandler({ type: MEDIA_ASSET_DESCRIBED, subscriber: REANNOUNCE_PRODUCT_MEDIA })
export class OnMediaAssetDescribedHandler implements DurableSubscriber {
  constructor(
    private readonly usage: ProductImageUsage,
    private readonly readers: EditorialReader,
    private readonly durable: DurablePublisher,
    private readonly ids: UuidGenerator,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = MediaAssetDescribedFact.fromPayload(delivery.payload);
    const products = await this.usage.productsShowing(fact.url, SHOWCASED_ROLES);
    // En série : chaque annonce relit puis écrit dans la même transaction,
    // et une image n'est portée que par une poignée de fiches.
    for (const productId of products) {
      await announceProductMedia(
        { readers: this.readers, durable: this.durable, ids: this.ids },
        productId,
      );
    }
  }
}
