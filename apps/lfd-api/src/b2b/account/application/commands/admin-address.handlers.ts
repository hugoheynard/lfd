import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import {
  CompanyAddressNotFoundError,
  CompanyNotFoundError,
} from "../../domain/errors/account-errors.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import {
  BillingAddressSavedByStaffEvent,
  DefaultDeliverySetByStaffEvent,
  DeliveryAddressAddedByStaffEvent,
  DeliveryAddressRemovedByStaffEvent,
  DeliveryAddressUpdatedByStaffEvent,
  FulfillmentPreferenceSetByStaffEvent,
} from "../../domain/events/staff-address-acts.event.js";
import { CompanyAddressReader } from "../../domain/ports/company-address.reader.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import {
  AddDeliveryAddressByStaffCommand,
  PreferFulfillmentByStaffCommand,
  RemoveDeliveryAddressByStaffCommand,
  SetDefaultDeliveryByStaffCommand,
  UpdateDeliveryAddressByStaffCommand,
  SaveBillingAddressByStaffCommand,
} from "./admin-company-commands.js";

/**
 * Les gestes du staff sur les **adresses** d'un client, et sur la préférence
 * d'acheminement qui décide laquelle sert.
 *
 * Séparés des gestes sur la société elle-même (`admin-company.handlers.ts`)
 * quand le fichier a dépassé 300 lignes : ce n'est pas une coupure arbitraire
 * pour tenir la règle, c'est celle que la règle a rendue visible. Ces six
 * handlers partagent un dépôt, un mur (le rattachement à la société) et une
 * famille de faits.
 */
@CommandHandler(SaveBillingAddressByStaffCommand)
export class SaveBillingAddressByStaffHandler implements ICommandHandler<
  SaveBillingAddressByStaffCommand,
  void
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SaveBillingAddressByStaffCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.addresses.saveBilling(command.companyId, command.payload);
      await this.events.publishTraced(
        new BillingAddressSavedByStaffEvent(command.companyId, command.payload),
      );
    });
    // Pièce « facturation » franchie : fait d'ENTONNOIR, best-effort et hors
    // transaction — le perdre fausse une statistique, pas une responsabilité.
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
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AddDeliveryAddressByStaffCommand): Promise<string> {
    const addressId = await this.uow.run(async () => {
      const created = await this.addresses.addDelivery(command.companyId, command.payload);
      await this.events.publishTraced(
        new DeliveryAddressAddedByStaffEvent(command.companyId, created, command.payload),
      );
      return created;
    });
    // Pièce « livraison » franchie : fait d'entonnoir, best-effort.
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
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: PreferFulfillmentByStaffCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    await this.ensureOwnDeliveryAddress(command);
    company.preferFulfillment(command.preference);
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(
        new FulfillmentPreferenceSetByStaffEvent(command.companyId, {
          method: command.preference.method,
          pickupAddressId: command.preference.pickupAddressId,
          deliveryAddressId: command.preference.deliveryAddressId,
          signatureRequired: command.preference.signatureRequired,
        }),
      );
    });
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
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateDeliveryAddressByStaffCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.addresses.updateDelivery(command.companyId, command.addressId, command.payload);
      await this.events.publishTraced(
        new DeliveryAddressUpdatedByStaffEvent(
          command.companyId,
          command.addressId,
          command.payload,
        ),
      );
    });
  }
}

@CommandHandler(SetDefaultDeliveryByStaffCommand)
export class SetDefaultDeliveryByStaffHandler implements ICommandHandler<
  SetDefaultDeliveryByStaffCommand,
  void
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetDefaultDeliveryByStaffCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.addresses.setDefaultDelivery(command.companyId, command.addressId);
      await this.events.publishTraced(
        new DefaultDeliverySetByStaffEvent(command.companyId, command.addressId),
      );
    });
  }
}

@CommandHandler(RemoveDeliveryAddressByStaffCommand)
export class RemoveDeliveryAddressByStaffHandler implements ICommandHandler<
  RemoveDeliveryAddressByStaffCommand,
  void
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveDeliveryAddressByStaffCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.addresses.archiveDelivery(command.companyId, command.addressId);
      await this.events.publishTraced(
        new DeliveryAddressRemovedByStaffEvent(command.companyId, command.addressId),
      );
    });
  }
}
