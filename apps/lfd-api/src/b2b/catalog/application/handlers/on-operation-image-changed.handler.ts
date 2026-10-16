import { Injectable } from "@nestjs/common";

import {
  OperationImageChangedFact,
  PIM_OPERATION_IMAGE_CHANGED,
} from "../../../../pim/channels/b2b-platform/operations/operation-image-changed.fact.js";
import { AppConfig } from "../../../../platform/config/app-config.js";
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
 * médiathèque, comme une image posée, changée ou retirée sur l'opération au
 * référentiel, n'y paraissaient qu'au push suivant. Cet abonné projette le
 * fait que le référentiel déclare dans son canal vers la plateforme, comme
 * `OnProductMediaChangedHandler` le fait pour les fiches.
 *
 * - **Deux écrivains** : la projection sert la fraîcheur, le push la
 *   réparation ; ils lisent la même source.
 * - **L'ordre** : un fait plus ancien livré après un plus récent n'écrit
 *   rien (`showIfNewer`, sur `image_gesture_id`).
 * - **Il lève** : sous la boîte d'envoi, lever fait rejouer.
 * - **Il ne journalise rien** : la décision est tracée à la médiathèque ou
 *   au référentiel.
 * - 🔴 **Inerte interrupteur `OPERATIONS_AT_COMMERCE` ouvert** (lot 3 de
 *   `plan-l-operation-passe-au-commerce.md`) : l'image de l'opération est
 *   alors celle du commerce, que la médiathèque repointe par l'agrégat. Il
 *   acquitte sans écrire — lever ferait rejouer sans fin un fait qui n'a plus
 *   de destinataire.
 */
@Injectable()
@DurableHandler({ type: PIM_OPERATION_IMAGE_CHANGED, subscriber: PROJECT_OPERATION_IMAGE })
export class OnOperationImageChangedHandler implements DurableSubscriber {
  constructor(
    private readonly images: CatalogOperationImageProjection,
    private readonly config: AppConfig,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    if (this.config.operationsAtCommerce()) {
      return;
    }
    const fact = OperationImageChangedFact.fromPayload(delivery.payload);
    // Sans unité de travail à lui : le relais l'appelle déjà dans celle de la
    // livraison, qui porte aussi son reçu.
    await this.images.showIfNewer(fact.operationKey, fact.gestureId, fact.image);
  }
}
