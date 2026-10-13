/**
 * Déclarer `count` bacs entiers d'un type pour un transfert interne, au
 * chargement (lot T3, Q-T4 révisée) — les sacs des commandes du site dedans.
 */
export class DeclareTransferBinsCommand {
  constructor(
    readonly transferId: string,
    readonly binTypeId: string,
    readonly count: number,
    readonly innerBags: number,
  ) {}
}
