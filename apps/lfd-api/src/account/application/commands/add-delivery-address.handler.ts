import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../infra/events/domain-event-publisher.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { AddDeliveryAddressCommand } from "./address-commands.js";

/** Ajoute une adresse de livraison, réservé au gestionnaire de l'entreprise. */
@CommandHandler(AddDeliveryAddressCommand)
export class AddDeliveryAddressHandler implements ICommandHandler<
  AddDeliveryAddressCommand,
  string
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: AddDeliveryAddressCommand): Promise<string> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const addressId = await this.addresses.addDelivery(command.companyId, command.payload);
    // Pièce d'activation « livraison » franchie (journal idempotent par étape).
    this.events.publish(new CompanyStepReachedEvent(command.companyId, "delivery"));
    return addressId;
  }
}
