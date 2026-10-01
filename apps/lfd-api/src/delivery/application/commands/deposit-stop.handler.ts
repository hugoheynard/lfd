import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DeliveryStopDepositedEvent } from "../../domain/events/delivery-doorstep.events.js";
import { DoorstepDeposit } from "../../domain/value-objects/doorstep-deposit.js";
import { DoorstepHandover, type DoorstepHandoverGesture } from "../doorstep-handover.js";
import { DepositStopCommand } from "./deposit-stop.command.js";

/**
 * **« Déposé avec preuve »** (`documentation/livraisons/plan-a-la-porte.md`,
 * B2, AP-Q5, AP-Q6, AP-D5, AP-D8).
 *
 * Mêmes effets qu'une remise (AP-Q5, Hugo) : le retrait atteste `deposit`, la
 * commande devient `fulfilled` après la validation, les points et le volume
 * suivent. Ce qui est PROPRE au dépôt : la photo seule, refusée avant tout
 * envoi ; la permission de l'arrêt — dépôt autorisé figé au départ, ET pas de
 * signature exigée, qui l'emporte toujours — vérifiée sous le verrou par
 * `DoorstepStop.ensureDepositPermitted` (le point d'extension de B3) ; le
 * fait, dans l'unité de travail. Le reste vit dans `DoorstepHandover`.
 *
 * @throws {DepositPhotoMissingError} @throws {DepositNotAllowedError}
 * @throws {DepositSignatureRequiredError}
 * @throws ceux de `DoorstepHandover.closeAtDoor`.
 */
@CommandHandler(DepositStopCommand)
export class DepositStopHandler implements ICommandHandler<DepositStopCommand, void> {
  constructor(
    private readonly handover: DoorstepHandover,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DepositStopCommand): Promise<void> {
    const deposit = DoorstepDeposit.take(command.photo);
    const gesture: DoorstepHandoverGesture = {
      staffUserId: command.staffUserId,
      roundId: command.roundId,
      stopId: command.stopId,
      version: command.fields.version,
      receiverName: null,
      admit: (stop) => {
        stop.ensureDepositPermitted();
      },
    };
    await this.handover.perform({ photo: deposit.photo, signature: null }, (staged) =>
      this.uow.run(async () => {
        const closed = await this.handover.closeAtDoor(gesture, staged);
        if (closed === null) {
          return false;
        }
        await this.events.publishTraced(new DeliveryStopDepositedEvent(closed.round, closed.order));
        return true;
      }),
    );
  }
}
