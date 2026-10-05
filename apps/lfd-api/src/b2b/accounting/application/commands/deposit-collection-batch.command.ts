/**
 * Marque un lot déposé à la banque. Relit d'abord les mandats, les comptes et
 * les commandes : un fichier qui ne correspond plus à la réalité ne se marque
 * pas déposé (plan §2, §3).
 */
export class DepositCollectionBatchCommand {
  constructor(
    readonly batchId: string,
    readonly staffUserId: string,
  ) {}
}
