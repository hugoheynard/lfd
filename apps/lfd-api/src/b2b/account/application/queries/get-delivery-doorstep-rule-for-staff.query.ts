/** Lit la décision réglée d'avance à la porte d'une adresse (staff, B3 bis). */
export class GetDeliveryDoorstepRuleForStaffQuery {
  constructor(
    readonly companyId: string,
    readonly addressId: string,
  ) {}
}
