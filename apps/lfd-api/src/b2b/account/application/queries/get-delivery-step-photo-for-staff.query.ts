/** Sert la photo d'une étape d'un client (staff). */
export class GetDeliveryStepPhotoForStaffQuery {
  constructor(
    readonly companyId: string,
    readonly addressId: string,
    readonly stepId: string,
  ) {}
}
