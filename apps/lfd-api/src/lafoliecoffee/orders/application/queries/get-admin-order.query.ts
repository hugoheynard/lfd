/**
 * Lit **une** commande pour le staff. Distincte de `GetOrderQuery` : celle-ci ne
 * demande pas au demandeur d'être le client ou un membre — un commercial n'est
 * ni l'un ni l'autre, et lui faire emprunter le mur client aurait voulu dire
 * l'affaiblir pour tout le monde.
 */
export class GetAdminOrderQuery {
  constructor(readonly orderId: string) {}
}
