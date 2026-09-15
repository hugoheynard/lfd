/** Lit la procédure de livraison d'une adresse d'un client (staff). */
export class GetDeliveryProcedureForStaffQuery {
  constructor(
    readonly companyId: string,
    readonly addressId: string,
  ) {}
}
