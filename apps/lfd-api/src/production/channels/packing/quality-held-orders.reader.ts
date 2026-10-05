/**
 * **Lesquelles de ces commandes le contrôle qualité retient** — port que le
 * fournil PUBLIE et implémente, que le colisage lit pour composer son poste
 * (plan `colisage/plan-domaine-colisage.md`, §17.1, K3a).
 *
 * Le contrôle est un fait du fournil (`plan-controle-qualite.md`, D1) : le
 * colisage ne le copie pas, il pose la question, par lot, pour les commandes
 * de sa journée. La règle est `heldOrderIds` — celle que lit le retrait au
 * comptoir —, et elle reste chez le fournil.
 *
 * Un port à part et non `QualityHoldsReader` du canal du retrait : chaque canal
 * déclare ce que SON lecteur demande, et `packing → production` ne passe que
 * par ce dossier.
 */
export abstract class QualityHeldOrdersReader {
  /**
   * Le sous-ensemble de `orderIds` retenu ce jour-là : verdict courant
   * `blocking` sur la commande, ou sur un SKU qu'une de ses lignes du plan porte.
   *
   * @param serviceDay `AAAA-MM-JJ`.
   * @param orderIds identifiants opaques du commerce.
   */
  abstract heldOrders(
    serviceDay: string,
    orderIds: readonly string[],
  ): Promise<ReadonlySet<string>>;
}
