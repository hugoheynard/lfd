import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { DeliveryProcedureEditedByStaffEvent } from "../../domain/events/staff-address-acts.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { DeliveryProcedureLock } from "../../domain/ports/delivery-procedure.lock.js";
import { DeliveryProcedureRepository } from "../../domain/ports/delivery-procedure.repository.js";
import { ReviseDeliveryStepByStaffCommand } from "./admin-delivery-procedure-commands.js";
import { reviseDeliveryStep, type ProcedureEditingPorts } from "./delivery-procedure-editing.js";

/**
 * Refait une étape — titre, texte, photo, **par un agent** — sans mur membership, l'auth staff garde la route.
 *
 * Le fait `company.delivery_procedure_edited_by_staff` part **dans la transaction** de
 * l'écriture : une panne de journal annule le geste. Un livreur envoyé à la
 * mauvaise porte se remonte à qui a écrit la consigne.
 */
@CommandHandler(ReviseDeliveryStepByStaffCommand)
export class ReviseDeliveryStepByStaffHandler implements ICommandHandler<
  ReviseDeliveryStepByStaffCommand,
  void
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly procedures: DeliveryProcedureRepository,
    private readonly lock: DeliveryProcedureLock,
    private readonly store: DocumentStore,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: ReviseDeliveryStepByStaffCommand): Promise<void> {
    await reviseDeliveryStep(
      this.ports(),
      { companyId: command.companyId, addressId: command.addressId },
      command.stepId,
      {
        fields: command.fields,
        removePhoto: command.removePhoto,
        photo: command.photo,
      },
      () =>
        this.events.publishTraced(
          new DeliveryProcedureEditedByStaffEvent(
            command.companyId,
            command.addressId,
            "step_revised",
          ),
        ),
    );
  }

  /** Les ports de la séquence partagée — le handler n'y ajoute que son mur. */
  private ports(): ProcedureEditingPorts {
    return {
      addresses: this.addresses,
      procedures: this.procedures,
      lock: this.lock,
      store: this.store,
      ids: this.ids,
      uow: this.uow,
    };
  }
}
