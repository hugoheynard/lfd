/**
 * **« Réceptionner »** au comptoir du site — le transfert qui porte
 * `orderId` (plan du transfert interne, §6.3, lot T2). `reason` : obligatoire
 * quand aucune tournée ne l'a emporté (le domaine le dit).
 */
export class ReceiveTransferAtCounterCommand {
  constructor(
    readonly orderId: string,
    readonly staffUserId: string,
    readonly reason: string | null,
  ) {}
}
