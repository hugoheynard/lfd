import type { DeliveryProcedureView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { DeliveryProcedureReader } from "../../domain/ports/delivery-procedure.reader.js";
import { ensureDeliveryAddress } from "../services/delivery-address-guard.js";
import { GetDeliveryProcedureForStaffQuery } from "./get-delivery-procedure-for-staff.query.js";

/** Sert la procédure au staff — sans mur membership, le rattachement au carnet reste. */
@QueryHandler(GetDeliveryProcedureForStaffQuery)
export class GetDeliveryProcedureForStaffHandler implements IQueryHandler<
  GetDeliveryProcedureForStaffQuery,
  DeliveryProcedureView
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly procedures: DeliveryProcedureReader,
  ) {}

  async execute(query: GetDeliveryProcedureForStaffQuery): Promise<DeliveryProcedureView> {
    await ensureDeliveryAddress(this.addresses, query.companyId, query.addressId);
    return this.procedures.read(query.companyId, query.addressId);
  }
}
