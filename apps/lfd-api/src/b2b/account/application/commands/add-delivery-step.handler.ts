import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { DeliveryProcedureEditedByMemberEvent } from "../../domain/events/member-acts.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { DeliveryProcedureLock } from "../../domain/ports/delivery-procedure.lock.js";
import { DeliveryProcedureRepository } from "../../domain/ports/delivery-procedure.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { AddDeliveryStepCommand } from "./delivery-procedure-commands.js";
import { addDeliveryStep, type ProcedureEditingPorts } from "./delivery-procedure-editing.js";

/**
 * Ajoute une étape à la procédure d'une adresse de la société, réservé au **gestionnaire** (`ensureCompanyAdmin`).
 *
 * Le handler ne porte que le mur : la séquence (valider, ranger, écrire, puis
 * nettoyer le stockage) est celle de `delivery-procedure-editing.ts`, partagée
 * avec la porte staff. Le fait
 * `company.delivery_procedure_edited` part **dans la transaction** de
 * l'écriture, sous le même nom que chez le staff (depuis le 2026-09-19 : un
 * geste, un nom, l'auteur de la ligne les distingue).
 */
@CommandHandler(AddDeliveryStepCommand)
export class AddDeliveryStepHandler implements ICommandHandler<AddDeliveryStepCommand, string> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly addresses: CompanyAddressRepository,
    private readonly procedures: DeliveryProcedureRepository,
    private readonly lock: DeliveryProcedureLock,
    private readonly store: DocumentStore,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: AddDeliveryStepCommand): Promise<string> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    return await addDeliveryStep(
      this.ports(),
      { companyId: command.companyId, addressId: command.addressId },
      command.fields,
      command.photo,
      () =>
        this.events.publishTraced(
          new DeliveryProcedureEditedByMemberEvent(
            command.companyId,
            command.addressId,
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
