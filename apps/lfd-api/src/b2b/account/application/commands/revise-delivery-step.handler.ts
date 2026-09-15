import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { DeliveryProcedureLock } from "../../domain/ports/delivery-procedure.lock.js";
import { DeliveryProcedureRepository } from "../../domain/ports/delivery-procedure.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { ReviseDeliveryStepCommand } from "./delivery-procedure-commands.js";
import {
  reviseDeliveryStep,
  NOTHING_TO_TRACE,
  type ProcedureEditingPorts,
} from "./delivery-procedure-editing.js";

/**
 * Refait une étape — titre, texte, photo, réservé au **gestionnaire** (`ensureCompanyAdmin`).
 *
 * Le handler ne porte que le mur : la séquence (valider, ranger, écrire, puis
 * nettoyer le stockage) est celle de `delivery-procedure-editing.ts`, partagée
 * avec la porte staff. Rien n'est inscrit au journal : le gestionnaire agit sur
 * le compte de sa propre société.
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
  ) {}

  async execute(command: ReviseDeliveryStepCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    await reviseDeliveryStep(
      this.ports(),
      { companyId: command.companyId, addressId: command.addressId },
      command.stepId,
      {
        fields: command.fields,
        removePhoto: command.removePhoto,
        photo: command.photo,
      },
      NOTHING_TO_TRACE,
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
