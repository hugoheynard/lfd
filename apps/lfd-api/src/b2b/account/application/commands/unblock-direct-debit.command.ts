/**
 * Commande **staff** (comptabilité) : rétablir le prélèvement mensuel d'une
 * société bloquée. Le crédit accordé redevient le régime, tel qu'il était.
 *
 * L'auteur n'est pas dans la commande : la ligne de journal le porte.
 */
export class UnblockDirectDebitCommand {
  constructor(readonly companyId: string) {}
}
