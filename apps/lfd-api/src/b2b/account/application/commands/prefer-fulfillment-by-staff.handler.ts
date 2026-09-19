import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import {
  CompanyAddressNotFoundError,
  CompanyNotFoundError,
} from "../../domain/errors/account-errors.js";
import { FulfillmentPreferenceSetByStaffEvent } from "../../domain/events/staff-address-acts.event.js";
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
