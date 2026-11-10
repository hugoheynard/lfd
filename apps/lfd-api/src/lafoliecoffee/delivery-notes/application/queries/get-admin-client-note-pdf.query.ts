/** Le BL **chiffré** d'une commande, en PDF, téléchargé par l'équipe (plan E5a, § 3). */
export class GetAdminClientNotePdfQuery {
  constructor(
    readonly orderId: string,
    readonly noteNumber: string,
  ) {}
}
