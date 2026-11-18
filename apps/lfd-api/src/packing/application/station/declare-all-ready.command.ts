/**
 * **« Tout est prêt »** sur une commande à retirer, colisée au niveau simple
 * (plan des niveaux de suivi du colisage, D4). `intentKey` : la clé de
 * l'écran — un double clic ne ferme qu'une fois.
 */
export class DeclareAllReadyCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly staffUserId: string,
    readonly intentKey: string,
  ) {}
}
