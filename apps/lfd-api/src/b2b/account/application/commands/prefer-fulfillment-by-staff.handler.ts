import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import {
  CompanyAddressNotFoundError,
  CompanyNotFoundError,
} from "../../domain/errors/account-errors.js";
import { FulfillmentPreferenceSetByStaffEvent } from "../../domain/events/staff-address-acts.event.js";
import { companyNamed, type DeliveryAddressRef } from "../../domain/events/journal-names.js";
import { CompanyAddressReader } from "../../domain/ports/company-address.reader.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { PreferFulfillmentByStaffCommand } from "./prefer-fulfillment-by-staff.command.js";

/**
 * Pose la préférence d'acheminement — celle qui décide quelle adresse du client
 * sert —, après avoir vérifié que l'adresse désignée est bien **celle de cette
 * société**.
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
    const deliveryAddress = await this.ownDeliveryAddress(command);
    company.preferFulfillment(command.preference);
    // La préférence telle que l'agrégat l'a retenue : l'adresse de l'autre mode
    // y est remise à `null`, et le journal dit ce qui a été posé.
    const kept = company.fulfillmentPreference;
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(
        new FulfillmentPreferenceSetByStaffEvent(companyNamed(command.companyId, company), {
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
    command: PreferFulfillmentByStaffCommand,
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
