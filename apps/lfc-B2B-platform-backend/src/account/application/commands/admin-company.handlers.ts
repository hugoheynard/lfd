import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { KbisStore } from "../../domain/ports/kbis-store.js";
import {
  AddDeliveryAddressByStaffCommand,
  SaveBillingAddressByStaffCommand,
  SetAgreedPaymentTermCommand,
  UpdateIdentityByStaffCommand,
  UploadKbisByStaffCommand,
} from "./admin-company-commands.js";
import { ingestKbis } from "./ingest-kbis.js";

/**
 * Handlers **staff** (Porte B) des pièces d'activation. Ils ne rejouent **aucun
 * mur membership** — l'auth staff (`AdminAuthGuard`) garde la route en amont, et
 * le staff n'est membre d'aucune société. Chacun délègue directement au même
 * port d'écriture que son homologue client : la logique de persistance n'est
 * écrite qu'une fois, seul le mur diffère.
 */

@CommandHandler(UploadKbisByStaffCommand)
export class UploadKbisByStaffHandler implements ICommandHandler<UploadKbisByStaffCommand, void> {
  constructor(
    private readonly store: KbisStore,
    private readonly companies: CompanyRepository,
  ) {}

  async execute(command: UploadKbisByStaffCommand): Promise<void> {
    await ingestKbis(
      command.companyId,
      command.fileName,
      command.bytes,
      this.store,
      this.companies,
    );
  }
}

@CommandHandler(UpdateIdentityByStaffCommand)
export class UpdateIdentityByStaffHandler implements ICommandHandler<
  UpdateIdentityByStaffCommand,
  void
> {
  constructor(private readonly companies: CompanyRepository) {}

  async execute(command: UpdateIdentityByStaffCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.editSoftIdentity(command.payload);
    await this.companies.save(company);
  }
}

@CommandHandler(SetAgreedPaymentTermCommand)
export class SetAgreedPaymentTermHandler implements ICommandHandler<
  SetAgreedPaymentTermCommand,
  void
> {
  constructor(private readonly companies: CompanyRepository) {}

  async execute(command: SetAgreedPaymentTermCommand): Promise<void> {
    await this.companies.setAgreedPaymentTerm(command.companyId, command.paymentTerm);
  }
}

@CommandHandler(SaveBillingAddressByStaffCommand)
export class SaveBillingAddressByStaffHandler implements ICommandHandler<
  SaveBillingAddressByStaffCommand,
  void
> {
  constructor(private readonly addresses: CompanyAddressRepository) {}

  async execute(command: SaveBillingAddressByStaffCommand): Promise<void> {
    await this.addresses.saveBilling(command.companyId, command.payload);
  }
}

@CommandHandler(AddDeliveryAddressByStaffCommand)
export class AddDeliveryAddressByStaffHandler implements ICommandHandler<
  AddDeliveryAddressByStaffCommand,
  string
> {
  constructor(private readonly addresses: CompanyAddressRepository) {}

  execute(command: AddDeliveryAddressByStaffCommand): Promise<string> {
    return this.addresses.addDelivery(command.companyId, command.payload);
  }
}
