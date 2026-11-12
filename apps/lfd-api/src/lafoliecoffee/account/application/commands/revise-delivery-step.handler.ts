import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { customerIntentActor } from "../../../shared/intent/customer-intent-actor.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { DeliveryProcedureEditedByMemberEvent } from "../../domain/events/member-acts.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { DeliveryProcedureLock } from "../../domain/ports/delivery-procedure.lock.js";
import { DeliveryProcedureRepository } from "../../domain/ports/delivery-procedure.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { ReviseDeliveryStepCommand } from "./delivery-procedure-commands.js";
import { reviseDeliveryStep, type ProcedureEditingPorts } from "./delivery-procedure-editing.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";

/** Le nom stable du geste, dans le registre des intentions. */
const REVISE_STEP_GESTURE = "account.revise-delivery-step";

/**
 * Refait une étape — titre, texte, photo, réservé au **gestionnaire** (`ensureCompanyAdmin`).
 *
 * Le handler ne porte que le mur : la séquence (valider, ranger, écrire, puis
 * nettoyer le stockage) est celle de `delivery-procedure-editing.ts`, partagée
 * avec la porte staff. Le fait
 * `company.delivery_procedure_edited` part **dans la transaction** de
 * l'écriture, sous le même nom que chez le staff (depuis le 2026-09-19 : un
 * geste, un nom, l'auteur de la ligne les distingue).
 */
@CommandHandler(ReviseDeliveryStepCommand)
export class ReviseDeliveryStepHandler implements ICommandHandler<ReviseDeliveryStepCommand, void> {
  constructor(
    private readonly memberships: MembershipReader,
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

  async execute(command: ReviseDeliveryStepCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    await this.intents.runSealed(
      {
        actorId: customerIntentActor(command.actorUserId),
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
              new DeliveryProcedureEditedByMemberEvent(
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
