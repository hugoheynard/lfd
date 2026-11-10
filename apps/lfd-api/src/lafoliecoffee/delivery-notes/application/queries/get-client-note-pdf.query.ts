/**
 * Le BL chiffré **d'une commande remise**, téléchargé par le client depuis son
 * espace (plan E5a, § 3), derrière le mur de sa société.
 */
export class GetClientNotePdfQuery {
  constructor(
    readonly actorUserId: string,
    readonly orderId: string,
  ) {}
}
