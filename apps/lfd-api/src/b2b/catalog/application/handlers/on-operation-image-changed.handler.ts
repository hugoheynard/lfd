import { Injectable } from "@nestjs/common";

import { PIM_OPERATION_IMAGE_CHANGED } from "../../../../pim/channels/b2b-platform/operations/operation-image-changed.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const PROJECT_OPERATION_IMAGE = "catalog.project-operation-image";

/**
 * **Inerte depuis le 2026-10-17** (X1 de
 * `documentation/catalogue/plan-sans-interrupteurs.md`) : l'image d'une
 * opération est celle du commerce, que la médiathèque repointe par l'agrégat.
 * Il acquitte sans écrire — lever ferait rejouer sans fin un fait qui n'a
 * plus de destinataire. Il reste abonné jusqu'au retrait des opérations du
 * référentiel (X4), pour qu'un fait encore dans la boîte d'envoi s'acquitte.
 *
 * Avant, il projetait `pim.operation_image_changed` sur la copie
 * `catalog_operations.image_*` (`documentation/mediatheque/mediatheque.md`
 * §7 bis), tant que l'opération vivait au référentiel.
 */
@Injectable()
@DurableHandler({ type: PIM_OPERATION_IMAGE_CHANGED, subscriber: PROJECT_OPERATION_IMAGE })
export class OnOperationImageChangedHandler implements DurableSubscriber {
  handle(_delivery: DurableDelivery): Promise<void> {
    return Promise.resolve();
  }
}
