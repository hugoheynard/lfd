import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { DeliveryProcedureEditedByStaffEvent } from "../../domain/events/staff-address-acts.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { DeliveryProcedureLock } from "../../domain/ports/delivery-procedure.lock.js";
import { DeliveryProcedureRepository } from "../../domain/ports/delivery-procedure.repository.js";
import { AddDeliveryStepByStaffCommand } from "./admin-delivery-procedure-commands.js";
import { addDeliveryStep, type ProcedureEditingPorts } from "./delivery-procedure-editing.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";

/**
 * Ajoute une étape à la procédure d'une adresse de la société, **par un agent** — sans mur membership, l'auth staff garde la route.
 *
 * Le fait `company.delivery_procedure_edited` part **dans la transaction** de
 * l'écriture : une panne de journal annule le geste. Un livreur envoyé à la
 * mauvaise porte se remonte à qui a écrit la consigne.
 */
@CommandHandler(AddDeliveryStepByStaffCommand)
export class AddDeliveryStepByStaffHandler implements ICommandHandler<
  AddDeliveryStepByStaffCommand,
  string
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly procedures: DeliveryProcedureRepository,
    private readonly lock: DeliveryProcedureLock,
    private readonly store: DocumentStore,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
    private readonly events: DomainEventPublisher,
    private readonly names: AccountJournalNames,
  ) {}

  async execute(command: AddDeliveryStepByStaffCommand): Promise<string> {
    return await addDeliveryStep(
      this.ports(),
      { companyId: command.companyId, addressId: command.addressId },
      command.fields,
      command.photo,
      async () =>
        this.events.publishTraced(
          new DeliveryProcedureEditedByStaffEvent(
            // Lus DANS la transaction, après la vérification de l'adresse :
            // un contenu refusé ne coûte toujours pas une lecture.
            await this.names.company(command.companyId),
            await this.names.deliveryAddress(command.companyId, command.addressId),
            "step_added",
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
