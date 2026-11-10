/** Lit la procédure de livraison d'une adresse (tout membre de la société). */
export class GetDeliveryProcedureQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly addressId: string,
  ) {}
}
