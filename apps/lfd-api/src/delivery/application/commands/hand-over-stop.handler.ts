import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DeliveryStopHandedOverEvent } from "../../domain/events/delivery-doorstep.events.js";
import { DoorstepReceipt } from "../../domain/value-objects/doorstep-receipt.js";
import { DoorstepHandover, type DoorstepHandoverGesture } from "../doorstep-handover.js";
import { gesturePositionOf } from "../doorstep-support.js";
import { HandOverStopCommand } from "./hand-over-stop.command.js";

/**
 * **« Remis au client »** (`documentation/livraisons/a-la-porte.md`, B1,
 * § 9, § 10 bis, AP-D1, AP-D6, L6-C7).
 *
 * Ce qui est PROPRE à la remise : les pièces (photo, nom de 2 à 80, images
 * lisibles), refusées AVANT tout envoi ; la signature exigée au départ,
 * vérifiée sous le verrou ; le fait, dans l'unité de travail. Le reste du
 * geste — mur, rejeu qui republie, version, attestation, clôture, publication
 * après validation — est celui du dépôt aussi (AP-Q5), et vit dans
 * `DoorstepHandover`.
 *
 * @throws ceux de `DoorstepReceipt`, et ceux de `DoorstepHandover.closeAtDoor`.
 * @throws {GesturePositionInvalidError} la position envoyée est impossible (YA-D4).
 */
@CommandHandler(HandOverStopCommand)
export class HandOverStopHandler implements ICommandHandler<HandOverStopCommand, void> {
  constructor(
    private readonly handover: DoorstepHandover,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: HandOverStopCommand): Promise<void> {
    const receipt = DoorstepReceipt.take({
      receiverName: command.fields.receiverName,
      photo: command.photo,
      signature: command.signature,
    });
    const gesture: DoorstepHandoverGesture = {
      staffUserId: command.staffUserId,
      roundId: command.roundId,
      stopId: command.stopId,
      version: command.fields.version,
      position: gesturePositionOf(command.fields),
      receiverName: receipt.receiverName,
      admit: (stop) => {
        receipt.ensureSignedIf(stop.signatureRequired, stop.label);
      },
    };
    await this.handover.perform({ photo: receipt.photo, signature: receipt.signature }, (staged) =>
      this.uow.run(async () => {
        const closed = await this.handover.closeAtDoor(gesture, staged);
        if (closed === null) {
          return false;
        }
        await this.events.publishTraced(
          new DeliveryStopHandedOverEvent(closed.round, closed.order, receipt.signed),
        );
        return true;
      }),
    );
  }
}
