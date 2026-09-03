import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { AddDeliveryAddressCommand } from "./address-commands.js";

/**
 * Ajoute une adresse de livraison, réservé au gestionnaire de l'entreprise.
 *
 * Le handler n'arbitre rien : c'est le carnet qui sait si cette adresse devient
 * le défaut — notamment quand c'est la première, cas qu'aucun écran ne demande
 * mais que le modèle exige.
 */
@CommandHandler(AddDeliveryAddressCommand)
export class AddDeliveryAddressHandler implements ICommandHandler<
  AddDeliveryAddressCommand,
  string
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: AddDeliveryAddressCommand): Promise<string> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const book = await this.addresses.loadDeliveryBook(command.companyId);
    const addressId = this.ids.next();
    book.add(addressId, command.payload, this.clock.now());
    await this.addresses.saveDeliveryBook(book);

    // Pièce d'activation « livraison » franchie (journal idempotent par étape).
    this.events.publish(new CompanyStepReachedEvent(command.companyId, "delivery"));
    return addressId;
  }
}
