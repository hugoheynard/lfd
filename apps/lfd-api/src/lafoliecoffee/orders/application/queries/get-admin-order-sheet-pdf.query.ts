/**
 * **Le bon de commande d'une commande, pour le BUREAU.**
 *
 * Aucun acteur en paramètre, et c'est la seule différence avec la requête
 * cliente : le mur est celui du back-office (`@AdminSurface("b2b_orders")`),
 * posé sur le contrôleur. Y remettre un `actorUserId` inviterait à croire qu'une
 * seconde vérification a lieu ici, ce qui serait faux.
 *
 * ⚠️ Le document servi est **exactement celui du client** — même projection,
 * même clé d'archive. Il n'y a pas de version staff, sur décision explicite :
 * celui qu'on discute au téléphone doit être celui que le client a sous les yeux.
 */
export class GetAdminOrderSheetPdfQuery {
  constructor(readonly orderId: string) {}
}
