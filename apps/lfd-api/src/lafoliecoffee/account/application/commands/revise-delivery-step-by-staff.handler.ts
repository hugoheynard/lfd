import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { DeliveryProcedureEditedByStaffEvent } from "../../domain/events/staff-address-acts.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { DeliveryProcedureLock } from "../../domain/ports/delivery-procedure.lock.js";
import { DeliveryProcedureRepository } from "../../domain/ports/delivery-procedure.repository.js";
import { ReviseDeliveryStepByStaffCommand } from "./revise-delivery-step-by-staff.command.js";
import { reviseDeliveryStep, type ProcedureEditingPorts } from "./delivery-procedure-editing.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";

/** Le nom stable du geste, dans le registre des intentions. */
const REVISE_STEP_GESTURE = "account.revise-delivery-step-by-staff";

/**
 * Refait une étape — titre, texte, photo, **par un agent** — sans mur membership, l'auth staff garde la route.
 *
 * Le fait `company.delivery_procedure_edited` part **dans la transaction** de
 * l'écriture : une panne de journal annule le geste. Un livreur envoyé à la
 * mauvaise porte se remonte à qui a écrit la consigne.
 *
 * **Une fois par intention** : une révision qui porte une photo la range à
 * neuf et écrit un fait — rejouée, elle le referait. La clé de l'écran est
 * scellée avec l'écriture et son fait ; un double envoi ne refait rien.
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
    private readonly names: AccountJournalNames,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: ReviseDeliveryStepByStaffCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: REVISE_STEP_GESTURE,
        subject: intentSubject(command.stepId, command.fields, command.removePhoto, command.photo),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        reviseDeliveryStep(
          this.ports(),
          { companyId: command.companyId, addressId: command.addressId },
          command.stepId,
          {
            fields: command.fields,
            removePhoto: command.removePhoto,
            photo: command.photo,
          },
          async (action) => {
            await this.events.publishTraced(
              new DeliveryProcedureEditedByStaffEvent(
                // Lus DANS la transaction, après la vérification de l'adresse :
                // un contenu refusé ne coûte toujours pas une lecture.
                await this.names.company(command.companyId),
                await this.names.deliveryAddress(command.companyId, command.addressId),
                action,
              ),
            );
            await seal();
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
