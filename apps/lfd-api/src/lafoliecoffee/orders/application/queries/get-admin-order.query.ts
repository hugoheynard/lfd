/**
 * Lit **une** commande pour le staff. Distincte de `GetOrderQuery` : celle-ci ne
 * demande pas au demandeur d'être le client ou un membre — un commercial n'est
 * ni l'un ni l'autre, et lui faire emprunter le mur client aurait voulu dire
 * l'affaiblir pour tout le monde.
 */
export class GetAdminOrderQuery {
  constructor(
    readonly orderId: string,
    /**
     * L'appelant a `lfc_product_limit_override:read`, lu en base par la porte
     * staff : la vue porte les limites de produit passées sur la commande.
     */
    readonly withItemLimitOverrides: boolean,
  ) {}
}
