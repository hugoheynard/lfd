import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import {
  CompanyAddressNotFoundError,
  CompanyNotFoundError,
} from "../../domain/errors/account-errors.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import { CompanyAddressReader } from "../../domain/ports/company-address.reader.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import {
  AddDeliveryAddressByStaffCommand,
  PreferFulfillmentByStaffCommand,
  RemoveDeliveryAddressByStaffCommand,
  SetDefaultDeliveryByStaffCommand,
  UpdateDeliveryAddressByStaffCommand,
  SaveBillingAddressByStaffCommand,
  GrantTermsCommand,
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
    private readonly store: DocumentStore,
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
    // Le back-office **corrige** là où le client ne fait que compléter : une
    // faute de frappe saisie au comptoir restait gravée, et le compte portait
    // une identité fausse sans recours. Un champ vide ne réécrit rien.
    company.correctLegalIdentity({
      raisonSociale: command.payload.raisonSociale,
      formeJuridique: command.payload.formeJuridique,
      siret: command.payload.siret,
    });
    await this.companies.save(company);

    // Pièce « TVA » franchie dès qu'un numéro est présent (idempotent par étape).
    if (command.payload.vatNumber.trim() !== "") {
      this.events.publish(new CompanyStepReachedEvent(command.companyId, "vat"));
    }
  }
}

@CommandHandler(GrantTermsCommand)
export class GrantTermsHandler implements ICommandHandler<GrantTermsCommand, void> {
  constructor(private readonly companies: CompanyRepository) {}

  async execute(command: GrantTermsCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.grantTerms(command.grantedTerms);
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

/**
 * Pose la préférence d'acheminement, après avoir vérifié que l'adresse désignée
 * est bien **celle de cette société**.
 *
 * Le contrôle est ici et non dans l'agrégat : c'est une question de *rattachement*
 * (deux agrégats), pas d'invariant interne. Sans lui, un identifiant recopié
 * ferait pointer la préférence d'un client sur l'adresse d'un autre — la
 * commande partirait ensuite chez le voisin, et personne ne saurait pourquoi.
 */
@CommandHandler(PreferFulfillmentByStaffCommand)
export class PreferFulfillmentByStaffHandler implements ICommandHandler<
  PreferFulfillmentByStaffCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly addresses: CompanyAddressReader,
  ) {}

  async execute(command: PreferFulfillmentByStaffCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    await this.ensureOwnDeliveryAddress(command);
    company.preferFulfillment(command.preference);
    await this.companies.save(company);
  }

  /** L'adresse préférée doit appartenir à la société — ou ne pas être désignée. */
  private async ensureOwnDeliveryAddress(command: PreferFulfillmentByStaffCommand): Promise<void> {
    const wanted = command.preference.deliveryAddressId;
    if (command.preference.method !== "delivery" || wanted === null) {
      return;
    }
    const { deliveries } = await this.addresses.read(command.companyId);
    if (!deliveries.some((address) => address.id === wanted)) {
      throw new CompanyAddressNotFoundError(wanted);
    }
  }
}

/**
 * Gestes staff sur une adresse de livraison **déjà posée** : la corriger, la
 * désigner par défaut, l'archiver.
 *
 * Aucun mur membership — l'auth staff garde la route, comme pour les autres
 * pièces. Le mur qui reste est celui du **rattachement** : chaque méthode du
 * port porte le `companyId`, et l'implémentation filtre sur (`id` ET
 * `companyId`). Une adresse d'une autre société n'est donc pas touchée, elle est
 * déclarée introuvable.
 */
@CommandHandler(UpdateDeliveryAddressByStaffCommand)
export class UpdateDeliveryAddressByStaffHandler implements ICommandHandler<
  UpdateDeliveryAddressByStaffCommand,
  void
> {
  constructor(private readonly addresses: CompanyAddressRepository) {}

  async execute(command: UpdateDeliveryAddressByStaffCommand): Promise<void> {
    await this.addresses.updateDelivery(command.companyId, command.addressId, command.payload);
  }
}

@CommandHandler(SetDefaultDeliveryByStaffCommand)
export class SetDefaultDeliveryByStaffHandler implements ICommandHandler<
  SetDefaultDeliveryByStaffCommand,
  void
> {
  constructor(private readonly addresses: CompanyAddressRepository) {}

  async execute(command: SetDefaultDeliveryByStaffCommand): Promise<void> {
    await this.addresses.setDefaultDelivery(command.companyId, command.addressId);
  }
}

@CommandHandler(RemoveDeliveryAddressByStaffCommand)
export class RemoveDeliveryAddressByStaffHandler implements ICommandHandler<
  RemoveDeliveryAddressByStaffCommand,
  void
> {
  constructor(private readonly addresses: CompanyAddressRepository) {}

  async execute(command: RemoveDeliveryAddressByStaffCommand): Promise<void> {
    await this.addresses.archiveDelivery(command.companyId, command.addressId);
  }
}
