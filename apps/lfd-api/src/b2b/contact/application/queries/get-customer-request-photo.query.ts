/** Query : les octets d'une photo de demande, pour la boîte du back-office. */
export class GetCustomerRequestPhotoQuery {
  constructor(
    readonly requestId: string,
    readonly photoId: string,
  ) {}
}
