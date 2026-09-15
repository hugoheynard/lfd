/** Sert la photo d'une étape (tout membre de la société). */
export class GetDeliveryStepPhotoQuery {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly addressId: string,
    readonly stepId: string,
  ) {}
}
