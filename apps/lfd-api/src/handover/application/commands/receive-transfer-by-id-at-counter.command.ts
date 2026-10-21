/**
 * **« Réceptionner »** au comptoir du site — le transfert désigné par
 * lui-même : le chemin d'un transfert de réassort seul (R3c), qu'aucune
 * commande de la file ne désigne. `reason` : obligatoire quand aucune tournée
 * ne l'a emporté (le domaine le dit).
 */
export class ReceiveTransferByIdAtCounterCommand {
  constructor(
    readonly transferId: string,
    readonly staffUserId: string,
    readonly reason: string | null,
  ) {}
}
