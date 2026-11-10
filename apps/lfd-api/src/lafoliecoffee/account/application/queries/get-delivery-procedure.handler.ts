import type { DeliveryProcedureView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { DeliveryProcedureReader } from "../../domain/ports/delivery-procedure.reader.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyMember } from "../../domain/services/company-access.js";
import { ensureDeliveryAddress } from "../services/delivery-address-guard.js";
import { GetDeliveryProcedureQuery } from "./get-delivery-procedure.query.js";

/**
 * Sert la procédure à tout **membre** : celui qui passe commande doit pouvoir
 * relire comment on livre chez lui, sans pouvoir la changer.
 */
@QueryHandler(GetDeliveryProcedureQuery)
export class GetDeliveryProcedureHandler implements IQueryHandler<
  GetDeliveryProcedureQuery,
  DeliveryProcedureView
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly addresses: CompanyAddressRepository,
    private readonly procedures: DeliveryProcedureReader,
  ) {}

  async execute(query: GetDeliveryProcedureQuery): Promise<DeliveryProcedureView> {
    const role = await this.memberships.roleOf(query.actorUserId, query.companyId);
    ensureCompanyMember(role, query.companyId);
    await ensureDeliveryAddress(this.addresses, query.companyId, query.addressId);
    return this.procedures.read(query.companyId, query.addressId);
  }
}
