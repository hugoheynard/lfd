/** Le BL **de transport** d'une commande, en PDF, pour l'équipe (plan E5a, § 3). */
export class GetCarrierNotePdfQuery {
  constructor(
    readonly orderId: string,
    readonly noteNumber: string,
  ) {}
}
