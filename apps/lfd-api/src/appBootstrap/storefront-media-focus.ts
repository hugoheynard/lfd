import { Injectable } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { RefocusStorefrontImageCommand } from "../b2b/storefront/application/refocus-storefront-image.command.js";
import {
  MEDIA_ASSET_DESCRIBED,
  MediaAssetDescribedFact,
} from "../media/channels/carriers/media-asset-described.fact.js";
import { ImageCatalogue } from "../pim/channels/media/image-catalogue.js";
import type { DurableDelivery } from "../platform/outbox/durable-event.js";
import { DurableHandler, type DurableSubscriber } from "../platform/outbox/durable-handler.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const REFOCUS_STOREFRONT_IMAGES = "storefront.refocus-images";

/**
 * **Le point focal posé à la médiathèque arrive sur la vitrine** — bannières,
 * infos, porte « Je passe la prendre » (L10 de
 * `documentation/mediatheque/plan-la-mediatheque-amelioree.md`, 2026-10-11).
 *
 * 🔴 Ici, dans `appBootstrap/`, et pas dans `b2b/` : `b2b → media` est hors
 * de la matrice, et la vitrine ne lit pas la médiathèque. Seule la racine de
 * composition voit les deux (précédent : `storefront-media-carriers.ts`). Elle
 * relit le point par le canal des porteurs (`ImageCatalogue`) et le tend à la
 * vitrine par une COMMANDE — c'est l'agrégat qui recadre et monte la révision.
 *
 * ## Pourquoi durable
 *
 * `media → b2b` traverse un bloc : en mémoire, un redémarrage entre la
 * description et le recadrage laisserait la vitrine sur l'ancien point sans
 * que personne le sache (`lint:durable-cross-block`). Le recadrage s'écrit
 * dans la transaction de la livraison, avec son reçu.
 *
 * ⚠️ **Il relit l'état d'aujourd'hui**, pas celui du geste : un fait rejoué
 * tard pose le point courant. Une image retirée du fonds entre-temps n'est
 * pas recadrée — la vitrine garde le point qu'elle avait.
 *
 * ⚠️ Un éditeur de vitrine ouvert avant le recadrage est refusé à
 * l'enregistrement (révision montée) : sans quoi il réécrirait l'ancien point.
 */
@Injectable()
@DurableHandler({ type: MEDIA_ASSET_DESCRIBED, subscriber: REFOCUS_STOREFRONT_IMAGES })
export class RefocusStorefrontOnMediaDescribed implements DurableSubscriber {
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
    await this.commands.execute<RefocusStorefrontImageCommand, number>(
      new RefocusStorefrontImageCommand(fact.url, image.focal),
    );
  }
}
