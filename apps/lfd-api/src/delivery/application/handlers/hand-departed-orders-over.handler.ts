import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { AfterCommit } from "../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../platform/events/background-work.js";
import { DepartedOrdersAnnouncer } from "../../channels/handover/index.js";
import { DeliveryRoundDepartedEvent } from "../../domain/events/delivery-loading.events.js";

/**
 * **La garde passe au livreur** (`documentation/livraisons/plan-a-la-porte.md`,
 * § 10 ter, BQ) : annoncer au retrait les commandes qui viennent de partir,
 * pour que le fournil cesse de les contrôler (LB-Q1).
 *
 * Un abonné de plus sur le départ, à côté de `AnnounceDeliveryDeparture`
 * (le courriel du commerce) : deux destinataires, deux raisons de changer.
 *
 * 🔴 **Après la validation du départ** (`AfterCommit`, B0) : un départ dont la
 * transaction échoue n'annonce rien — sans quoi le fournil refuserait un
 * verdict sur une commande restée au dépôt. Suivi par `BackgroundWork` : un
 * échec est journalisé et ne défait pas le départ ; la fenêtre ouverte est
 * celle d'un verdict encore permis sur une commande partie, le même cas
 * qu'avant ce lot.
 */
const HAND_OVER = "hand-departed-orders-over";

@EventsHandler(DeliveryRoundDepartedEvent)
export class HandDepartedOrdersOver implements IEventHandler<DeliveryRoundDepartedEvent> {
  constructor(
    private readonly announcer: DepartedOrdersAnnouncer,
    private readonly work: BackgroundWork,
    private readonly afterCommit: AfterCommit,
  ) {}

  handle(event: DeliveryRoundDepartedEvent): void {
    const departedAt = event.round.departedAt;
    // Un fait sans instant ne vient pas d'un départ : rien à annoncer.
    if (departedAt === null) {
      return;
    }
    const orderIds = event.round.orderIds;
    this.afterCommit.defer(
      () => this.work.track(this.announcer.ordersDeparted(orderIds, departedAt), HAND_OVER),
      HAND_OVER,
    );
  }
}
