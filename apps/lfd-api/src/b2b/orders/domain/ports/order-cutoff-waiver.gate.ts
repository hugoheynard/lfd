/**
 * Port des **dérogations d'heure limite**, vu depuis la passation de commande.
 *
 * Volontairement plus étroit que `OrderCutoffWaiverRepository` : composer une
 * commande n'autorise pas à en **accorder** une. Ce contexte-ci ne fait que
 * demander s'il en existe une, et la marquer quand elle a servi.
 *
 * Les deux méthodes vivent ensemble parce qu'elles sont **le même acte** vu de
 * ses deux bouts : on ne consulte une autorisation que pour s'en servir, et on
 * ne la consomme que si on l'a consultée. Les séparer en deux ports aurait
 * rendu possible d'oublier le second, c'est-à-dire de laisser une dérogation
 * ouverte après qu'elle a servi.
 */
export abstract class OrderCutoffWaiverGate {
  /**
   * L'autorisation **ouverte** de ce client pour cette journée, ou `null`.
   *
   * « Ouverte » = pas encore consommée. Une dérogation qui a servi ne rouvre
   * rien : c'est ce qui empêche une seule décision de laisser passer deux
   * commandes tardives.
   */
  abstract openFor(companyId: string, fulfillmentDate: string): Promise<{ id: string } | null>;

  /**
   * Marque la dérogation comme **consommée** par cette commande.
   *
   * Appelée APRÈS la persistance de la commande, et pas avant : consommer une
   * autorisation pour une commande qui échoue ensuite la brûlerait, et le client
   * devrait rappeler pour en obtenir une seconde qu'il avait déjà.
   */
  abstract consume(waiverId: string, orderId: string, at: Date): Promise<void>;
}
