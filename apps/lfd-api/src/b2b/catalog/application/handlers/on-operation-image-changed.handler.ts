import { Injectable } from "@nestjs/common";

import {
  OperationImageChangedFact,
  PIM_OPERATION_IMAGE_CHANGED,
} from "../../../../pim/channels/b2b-platform/operations/operation-image-changed.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { CatalogOperationImageProjection } from "../../domain/ports/catalog-operation-image.projection.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const PROJECT_OPERATION_IMAGE = "catalog.project-operation-image";

/**
 * **L'image d'une opération arrive en boutique sans republier le catalogue**
 * (`documentation/mediatheque/mediatheque.md` §7 bis, 2026-10-11).
 *
 * `catalog_operations.image_*` est une COPIE écrite par l'ingestion d'un
 * envoi. Un remplacement A → B ou une redescription du point focal à la
 * médiathèque n'y paraissaient qu'au push suivant. Cet abonné projette le
 * fait que le référentiel déclare dans son canal vers la plateforme, comme
 * `OnProductMediaChangedHandler` le fait pour les fiches.
 *
 * - **Deux écrivains** : la projection sert la fraîcheur, le push la
 *   réparation ; ils lisent la même source.
 * - **L'ordre** : un fait plus ancien livré après un plus récent n'écrit
 *   rien (`showIfNewer`, sur `image_gesture_id`).
 * - **Il lève** : sous la boîte d'envoi, lever fait rejouer.
 * - **Il ne journalise rien** : la décision est tracée à la médiathèque.
 */
@Injectable()
@DurableHandler({ type: PIM_OPERATION_IMAGE_CHANGED, subscriber: PROJECT_OPERATION_IMAGE })
export class OnOperationImageChangedHandler implements DurableSubscriber {
  constructor(private readonly images: CatalogOperationImageProjection) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = OperationImageChangedFact.fromPayload(delivery.payload);
    // Sans unité de travail à lui : le relais l'appelle déjà dans celle de la
    // livraison, qui porte aussi son reçu.
    await this.images.showIfNewer(fact.operationKey, fact.gestureId, fact.image);
  }
}
