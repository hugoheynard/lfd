import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { DeliveryProcedureEditedByStaffEvent } from "../../domain/events/staff-address-acts.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { DeliveryProcedureLock } from "../../domain/ports/delivery-procedure.lock.js";
import { DeliveryProcedureRepository } from "../../domain/ports/delivery-procedure.repository.js";
import { AddDeliveryStepByStaffCommand } from "./add-delivery-step-by-staff.command.js";
import { addDeliveryStep, type ProcedureEditingPorts } from "./delivery-procedure-editing.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";

/** Le nom stable du geste, dans le registre des intentions. */
const ADD_STEP_GESTURE = "account.add-delivery-step-by-staff";

/**
 * Ajoute une étape à la procédure d'une adresse de la société, **par un agent** — sans mur membership, l'auth staff garde la route.
 *
 * Le fait `company.delivery_procedure_edited` part **dans la transaction** de
 * l'écriture : une panne de journal annule le geste. Un livreur envoyé à la
 * mauvaise porte se remonte à qui a écrit la consigne.
 *
 * **Une fois par intention** : la clé de l'écran est scellée avec l'étape et
 * son fait ; un double envoi rend l'étape déjà ajoutée, sans seconde étape,
 * seconde photo ni second fait.
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
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: AddDeliveryStepByStaffCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: ADD_STEP_GESTURE,
        subject: intentSubject(command.addressId, command.fields, command.photo),
      },
      CREATED_ID_REPLAY,
      (seal) =>
        addDeliveryStep(
          this.ports(),
          { companyId: command.companyId, addressId: command.addressId },
          command.fields,
          command.photo,
          async (stepId) => {
            await this.events.publishTraced(
              new DeliveryProcedureEditedByStaffEvent(
                // Lus DANS la transaction, après la vérification de l'adresse :
                // un contenu refusé ne coûte toujours pas une lecture.
                await this.names.company(command.companyId),
                await this.names.deliveryAddress(command.companyId, command.addressId),
                "step_added",
              ),
            );
            await seal(stepId);
          },
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
