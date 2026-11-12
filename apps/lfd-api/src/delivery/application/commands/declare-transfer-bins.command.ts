/**
 * Déclarer `count` bacs entiers d'un type pour un transfert interne, au
 * chargement (lot T3, Q-T4 révisée) — les sacs des commandes du site dedans.
 * `intentKey` : la clé que l'écran a fabriquée pour ce geste — un double clic
 * ne déclare les bacs qu'une fois.
 */
export class DeclareTransferBinsCommand {
  constructor(
    readonly transferId: string,
    readonly binTypeId: string,
    readonly count: number,
    readonly innerBags: number,
    readonly staffUserId: string,
    readonly intentKey: string,
  ) {}
}
