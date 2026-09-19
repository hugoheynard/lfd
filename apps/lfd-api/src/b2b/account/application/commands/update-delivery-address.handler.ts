import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DeliveryAddressUpdatedByMemberEvent } from "../../domain/events/member-acts.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { UpdateDeliveryAddressCommand } from "./address-commands.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";
import { deliveryAddressOf } from "../../domain/events/journal-names.js";

/**
 * Remplace une adresse de livraison, réservé au gestionnaire de l'entreprise.
 *
 * Le carnet est chargé **pour cette entreprise** : une adresse d'une autre est
 * absente du carnet, donc introuvable — le mur ne dépend plus d'un `where` qu'un
 * appel pourrait oublier.
 *
 * Journalisé dans la transaction de l'écriture depuis le 2026-09-19 (plan
 * `documentation/journalisation/plan-journal-d-activite.md` §3, décision 1) —
 * sous le nom du geste staff jumeau, sans coordonnée.
 */
@CommandHandler(UpdateDeliveryAddressCommand)
export class UpdateDeliveryAddressHandler implements ICommandHandler<
  UpdateDeliveryAddressCommand,
  void
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly names: AccountJournalNames,
  ) {}

  async execute(command: UpdateDeliveryAddressCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const book = await this.addresses.loadDeliveryBook(command.companyId);
    book.edit(command.addressId, command.payload);
    const company = await this.names.company(command.companyId);
    await this.uow.run(async () => {
      await this.addresses.saveDeliveryBook(book);
      await this.events.publishTraced(
        new DeliveryAddressUpdatedByMemberEvent(
          company,
          deliveryAddressOf(book, command.addressId),
          command.payload,
        ),
      );
    });
  }
}
