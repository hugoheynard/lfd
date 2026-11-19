/**
 * Port de la **dépense** d'une dérogation d'heure limite, vu depuis la
 * passation de commande.
 *
 * Volontairement plus étroit que `OrderCutoffWaiverRepository` : composer une
 * commande n'autorise pas à en **accorder** une. La lire est la question du
 * délai de commande (le verdict la rend, sans la dépenser) ; la dépenser est
 * le geste de la passation, dans la transaction qui écrit la commande. Une
 * passation qui reçoit une dérogation de `admitWithinDeadline` la consomme :
 * une dérogation laissée ouverte après avoir servi laisserait passer une
 * seconde commande tardive sur une seule décision.
 */
export abstract class OrderCutoffWaiverGate {
  /**
   * Marque la dérogation comme **consommée** par cette commande.
   *
   * Appelée DANS la transaction qui écrit la commande, après l'écriture : la
   * commande et la dépense partent ensemble, ou rien ne part. Une commande qui
   * échoue ensuite ne brûle donc pas l'autorisation.
   *
   * @throws {OrderCutoffWaiverSpentError} la dérogation a déjà servi — une
   * autre passation l'a dépensée entre la lecture et l'écriture. La
   * transaction est annulée : la commande n'existe pas.
   */
  abstract consume(waiverId: string, orderId: string, at: Date): Promise<void>;
}
