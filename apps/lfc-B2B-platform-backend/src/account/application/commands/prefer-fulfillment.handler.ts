import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

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
 */
@CommandHandler(PreferFulfillmentCommand)
export class PreferFulfillmentHandler implements ICommandHandler<PreferFulfillmentCommand, void> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly companies: CompanyRepository,
    private readonly addresses: CompanyAddressReader,
  ) {}

  async execute(command: PreferFulfillmentCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    await this.ensureOwnDeliveryAddress(command);
    company.preferFulfillment(command.preference);
    await this.companies.save(company);
  }

  /** L'adresse préférée doit appartenir à la société — ou ne pas être désignée. */
  private async ensureOwnDeliveryAddress(command: PreferFulfillmentCommand): Promise<void> {
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
