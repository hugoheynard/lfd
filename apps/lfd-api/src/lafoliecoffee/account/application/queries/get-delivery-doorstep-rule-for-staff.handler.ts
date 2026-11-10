import type { AddressDoorstepRuleView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CompanyAddressNotFoundError } from "../../domain/errors/account-errors.js";
import { DeliveryDoorstepRuleReader } from "../../domain/ports/delivery-doorstep-rule.reader.js";
import { GetDeliveryDoorstepRuleForStaffQuery } from "./get-delivery-doorstep-rule-for-staff.query.js";

/**
 * Sert au commercial la règle d'avance d'une adresse (B3 bis) — sans mur
 * membership, le rattachement de l'adresse à la société reste.
 *
 * @throws {CompanyAddressNotFoundError}
 */
@QueryHandler(GetDeliveryDoorstepRuleForStaffQuery)
export class GetDeliveryDoorstepRuleForStaffHandler implements IQueryHandler<
  GetDeliveryDoorstepRuleForStaffQuery,
  AddressDoorstepRuleView
> {
  constructor(private readonly rules: DeliveryDoorstepRuleReader) {}

  async execute(query: GetDeliveryDoorstepRuleForStaffQuery): Promise<AddressDoorstepRuleView> {
    const view = await this.rules.ruleOf(query.companyId, query.addressId);
    if (view === null) {
      throw new CompanyAddressNotFoundError(query.addressId);
    }
    return view;
  }
}
