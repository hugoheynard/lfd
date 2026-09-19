import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { FulfillmentPreferenceSetByMemberEvent } from "../../domain/events/member-acts.event.js";
import { companyNamed, type DeliveryAddressRef } from "../../domain/events/journal-names.js";
import {
  CompanyAddressNotFoundError,
  CompanyNotFoundError,
} from "../../domain/errors/account-errors.js";
import { CompanyAddressReader } from "../../domain/ports/company-address.reader.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { PreferFulfillmentCommand } from "./company-settings-commands.js";

/**
 * Le **client** pose la préférence d'acheminement de sa société, réservé au
 * gestionnaire.
 *
 * Jumeau de `PreferFulfillmentByStaffCommand` à un mur près : ici l'acteur doit
 * être gestionnaire de la société, là l'auth staff garde la route. Les deux
 * partagent la même règle de rattachement — l'adresse désignée doit être celle
 * de cette société — parce que c'est un invariant du modèle, pas une politique
 * d'écran.
 *
 * Journalisé dans la transaction de l'écriture depuis le 2026-09-19 (plan
 * `documentation/journalisation/plan-journal-d-activite.md` §3, décision 1) —
 * sous le nom du geste staff jumeau, sans coordonnée.
 */
@CommandHandler(PreferFulfillmentCommand)
export class PreferFulfillmentHandler implements ICommandHandler<PreferFulfillmentCommand, void> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly companies: CompanyRepository,
    private readonly addresses: CompanyAddressReader,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: PreferFulfillmentCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    const deliveryAddress = await this.ownDeliveryAddress(command);
    company.preferFulfillment(command.preference);
    // La préférence telle que l'agrégat l'a retenue : l'adresse de l'autre mode
    // y est remise à `null`, et le journal dit ce qui a été posé.
    const kept = company.fulfillmentPreference;
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(
        new FulfillmentPreferenceSetByMemberEvent(companyNamed(command.companyId, company), {
          method: kept.method,
          pickupAddressId: kept.pickupAddressId,
          deliveryAddress,
          signatureRequired: kept.signatureRequired,
        }),
      );
    });
  }

  /**
   * L'adresse préférée doit appartenir à la société — ou ne pas être désignée.
   * Rendue citée par son lieu (lot B du plan des phrases) : id, ville et code
   * postal, jamais le libellé.
   */
  private async ownDeliveryAddress(
    command: PreferFulfillmentCommand,
  ): Promise<DeliveryAddressRef | null> {
    const wanted = command.preference.deliveryAddressId;
    if (command.preference.method !== "delivery" || wanted === null) {
      return null;
    }
    const { deliveries } = await this.addresses.read(command.companyId);
    const address = deliveries.find((candidate) => candidate.id === wanted);
    if (address === undefined) {
      throw new CompanyAddressNotFoundError(wanted);
    }
    return { id: wanted, ville: address.ville, codePostal: address.codePostal };
  }
}
