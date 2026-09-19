import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DefaultDeliverySetByMemberEvent } from "../../domain/events/member-acts.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { SetDefaultDeliveryAddressCommand } from "./address-commands.js";

/**
 * Désigne l'adresse de livraison par défaut, réservé au gestionnaire.
 *
 * Journalisé dans la transaction de l'écriture depuis le 2026-09-19 (plan
 * `documentation/journalisation/plan-journal-d-activite.md` §3, décision 1) —
 * sous le nom du geste staff jumeau, sans coordonnée.
 */
@CommandHandler(SetDefaultDeliveryAddressCommand)
export class SetDefaultDeliveryAddressHandler implements ICommandHandler<
  SetDefaultDeliveryAddressCommand,
  void
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetDefaultDeliveryAddressCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const book = await this.addresses.loadDeliveryBook(command.companyId);
    book.makeDefault(command.addressId);
    await this.uow.run(async () => {
      await this.addresses.saveDeliveryBook(book);
      await this.events.publishTraced(
        new DefaultDeliverySetByMemberEvent(command.companyId, command.addressId),
      );
    });
  }
}
