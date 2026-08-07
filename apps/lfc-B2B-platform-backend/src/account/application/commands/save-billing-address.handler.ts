import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../infra/events/domain-event-publisher.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { SaveBillingAddressCommand } from "./address-commands.js";

/** Enregistre l'adresse de facturation, réservé au gestionnaire de l'entreprise. */
@CommandHandler(SaveBillingAddressCommand)
export class SaveBillingAddressHandler implements ICommandHandler<SaveBillingAddressCommand, void> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: SaveBillingAddressCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    await this.addresses.saveBilling(command.companyId, command.payload);
    // Pièce d'activation « facturation » franchie (journal idempotent par étape).
    this.events.publish(new CompanyStepReachedEvent(command.companyId, "billing"));
  }
}
