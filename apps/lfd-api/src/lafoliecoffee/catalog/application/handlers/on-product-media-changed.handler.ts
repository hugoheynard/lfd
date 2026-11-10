import { Injectable } from "@nestjs/common";

import {
  PIM_PRODUCT_MEDIA_CHANGED,
  ProductMediaChangedFact,
} from "../../../../pim/channels/b2b-platform/products/product-media-changed.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { CatalogVisualsProjection } from "../../domain/ports/catalog-visuals.projection.js";
import { pimImageOf } from "../pim-image.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const PROJECT_PRODUCT_MEDIA = "catalog.project-product-media";

/**
 * **La photo d'une fiche arrive en boutique sans republier le catalogue.**
 *
 * 🔴 `catalog_items.image_url` est une COPIE, écrite par l'ingestion d'un
 * instantané. Changer une photo ne se voyait donc qu'après une republication —
 * un acte lourd, délibéré, et sans rapport avec le geste qu'on venait de
 * faire : « je ne veux pas republier pour les images » (Hugo, 2026-09-23).
 *
 * ## Deux écrivains sur les mêmes colonnes, et ils ne se contredisent pas
 *
 * L'ingestion d'un instantané écrit ces colonnes ; cette projection aussi.
 * Ils lisent **la même source de vérité** — le référentiel — donc ils ne
 * peuvent diverger que pendant la fenêtre où un instantané vieillit.
 *
 * - **la projection sert la FRAÎCHEUR** : elle arrive dans la seconde ;
 * - **le push sert la RÉPARATION** : il remet tout d'aplomb, y compris ce
 *   qu'une projection aurait manqué.
 *
 * ⚠️ **Un instantané fabriqué AVANT un changement de photo et ingéré APRÈS
 * annulera cette projection.** C'est correct au sens du modèle — l'instantané
 * dit ce que le catalogue ÉTAIT — mais ça se lira comme un défaut. La fenêtre
 * est celle d'un push, qui dure des minutes et se déclenche à la main. Le jour
 * où la publication devient automatique, il faudra dater les deux écritures et
 * faire gagner la plus récente.
 *
 * ## Ce que cet abonné ne fait pas
 *
 * ⚠️ **Il n'importe PAS l'intérieur du référentiel** — il lit un fait que le
 * référentiel déclare dans son canal vers la plateforme. Le PIM publie sans
 * savoir qui écoute ; `pim → b2b` reste interdit.
 *
 * ⚠️ **Il ne journalise rien.** Le référentiel a déjà inscrit la DÉCISION
 * (`product.media_saved`) ; ceci en est la conséquence.
 *
 * ## Durable depuis le 2026-10-10 (lot E5)
 *
 * Il écoutait `ProductMediaChangedEvent` en mémoire, publié APRÈS la
 * transaction du référentiel : un redémarrage entre les deux laissait la
 * boutique sur l'ancienne photo jusqu'au prochain push, sans que personne le
 * sache — la dernière dette de `lint:durable-cross-block`. Il lit désormais
 * `pim.product_media_changed`, écrit dans la transaction de la fiche
 * (`documentation/journalisation/plan-evenements-durables.md`, §7 quater).
 *
 * 🔴 **Il lève, désormais.** Il avalait ses échecs (« lever ne rejouerait
 * rien et remonterait une panne à qui enregistrait une fiche ») : sous la
 * boîte d'envoi, la fiche est déjà validée et lever fait REJOUER — avaler
 * ferait enregistrer comme projetée une photo qui ne l'a pas été.
 *
 * ## L'ordre de rejeu (2026-10-10, #12)
 *
 * Les visuels sont figés dans le fait : un fait ancien rejoué APRÈS un plus
 * récent remettait l'ancienne image. Il passe donc le GESTE à
 * `CatalogVisualsProjection.showIfNewer`, qui n'écrit que si la ligne n'a pas
 * encore de geste ou si celui-ci est postérieur — une écriture conditionnée
 * en base, la seule qui ne laisse pas deux livraisons se doubler. Un rejeu du
 * même geste n'écrit rien.
 */
@Injectable()
@DurableHandler({ type: PIM_PRODUCT_MEDIA_CHANGED, subscriber: PROJECT_PRODUCT_MEDIA })
export class OnProductMediaChangedHandler implements DurableSubscriber {
  constructor(private readonly visuals: CatalogVisualsProjection) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = ProductMediaChangedFact.fromPayload(delivery.payload);
    // Toutes les déclinaisons, retirées comprises ; un produit jamais poussé
    // n'a aucune ligne, et rien n'est créé — un article naît d'un push.
    // Sans unité de travail à lui : le relais l'appelle déjà dans celle de
    // la livraison, qui porte aussi son reçu.
    await this.visuals.showIfNewer(
      fact.productId,
      fact.gestureId,
      pimImageOf(fact.image),
      pimImageOf(fact.thumbnail),
    );
  }
}
