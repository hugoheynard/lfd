import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../infra/events/domain-event-publisher.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
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
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: UploadKbisByStaffCommand): Promise<void> {
    await ingestKbis(
      command.companyId,
      command.fileName,
      command.bytes,
      this.store,
      this.companies,
      this.events,
    );
  }
}

@CommandHandler(UpdateIdentityByStaffCommand)
export class UpdateIdentityByStaffHandler implements ICommandHandler<
  UpdateIdentityByStaffCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: UpdateIdentityByStaffCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.editSoftIdentity(command.payload);
    // Complète ce qui manquait à l'ouverture. Sans SIRET, pas d'activation
    // possible : ce serait un compte ouvert pour rien.
    company.completeLegalIdentity({
      formeJuridique: command.payload.formeJuridique,
      siret: command.payload.siret,
    });
    await this.companies.save(company);

    // Pièce « TVA » franchie dès qu'un numéro est présent (idempotent par étape).
    if (command.payload.tvaIntracom.trim() !== "") {
      this.events.publish(new CompanyStepReachedEvent(command.companyId, "tva"));
    }
  }
}

@CommandHandler(SetAgreedPaymentTermCommand)
export class SetAgreedPaymentTermHandler implements ICommandHandler<
  SetAgreedPaymentTermCommand,
  void
> {
  constructor(private readonly companies: CompanyRepository) {}

  async execute(command: SetAgreedPaymentTermCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.agreePaymentTerm(command.paymentTerm);
    await this.companies.save(company);
  }
}

@CommandHandler(SaveBillingAddressByStaffCommand)
export class SaveBillingAddressByStaffHandler implements ICommandHandler<
  SaveBillingAddressByStaffCommand,
  void
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: SaveBillingAddressByStaffCommand): Promise<void> {
    await this.addresses.saveBilling(command.companyId, command.payload);
    // Pièce « facturation » franchie (journal idempotent par étape).
    this.events.publish(new CompanyStepReachedEvent(command.companyId, "billing"));
  }
}

@CommandHandler(AddDeliveryAddressByStaffCommand)
export class AddDeliveryAddressByStaffHandler implements ICommandHandler<
  AddDeliveryAddressByStaffCommand,
  string
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: AddDeliveryAddressByStaffCommand): Promise<string> {
    const addressId = await this.addresses.addDelivery(command.companyId, command.payload);
    // Pièce « livraison » franchie (journal idempotent par étape).
    this.events.publish(new CompanyStepReachedEvent(command.companyId, "delivery"));
    return addressId;
  }
}
