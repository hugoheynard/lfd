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
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";

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
 * ferait enregistrer comme projetée une photo qui ne l'a pas été. Rejouée, la
 * projection ne double rien : c'est un écrasement des deux visuels.
 */
@Injectable()
@DurableHandler({ type: PIM_PRODUCT_MEDIA_CHANGED, subscriber: PROJECT_PRODUCT_MEDIA })
export class OnProductMediaChangedHandler implements DurableSubscriber {
  constructor(private readonly items: CatalogItemRepository) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = ProductMediaChangedFact.fromPayload(delivery.payload);
    // Les articles d'un produit, RETIRÉS COMPRIS : recevoir une photo n'est
    // pas revenir au catalogue, et un retiré doit garder son visuel à jour.
    const items = await this.items.loadByProduct(fact.productId);
    if (items.length === 0) {
      // Le cas NORMAL d'une fiche jamais poussée : elle existe au référentiel
      // et le commerce ne la connaît pas encore. Rien à projeter, et surtout
      // rien à créer — un article naît d'un push.
      return;
    }

    // 🔴 Par une méthode MÉTIER, jamais par une écriture de colonnes : le port
    // de ce dépôt l'interdit en toutes lettres, et `showVisuals` porte une
    // règle qu'un `updateMany` aurait tue — elle ne change QUE les visuels, ni
    // le prix, ni le retrait, ni la décision commerciale.
    // Sans unité de travail à lui : le relais l'appelle déjà dans celle de
    // la livraison, qui porte aussi son reçu.
    await this.items.saveMany(items.map((item) => item.showVisuals(fact.image, fact.thumbnail)));
  }
}
