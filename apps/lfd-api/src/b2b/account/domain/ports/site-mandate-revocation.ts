/**
 * **Révoquer les mandats d'un site qui nomment son principal** (`plan-sous-comptes.md`
 * §2.1 ter).
 *
 * Un site qui cesse de suivre `billing` — ou qu'on détache — reprend son
 * identité propre. Un mandat frappé pendant le suivi nomme le PRINCIPAL
 * débiteur : le garder actif ferait prélever, pour une autre identité, sur
 * une autorisation que le principal a donnée — le seul cas que le plan
 * interdit. La révocation est datée, et le mandat reste en base.
 *
 * Déclaré ici et implémenté par `payments`, qui possède les mandats ; relié à
 * la racine de composition, comme `PricingFollowJournal`. Appelé DANS la
 * transaction du geste, sous le verrou de la hiérarchie : la période se ferme
 * et ses mandats tombent ensemble, ou rien ne bouge.
 */
export abstract class SiteMandateRevocation {
  /**
   * Révoque à `at` les mandats actifs ou en brouillon que porte `siteId` et
   * qui nomment `payerId` débiteur. Sans effet s'il n'y en a aucun.
   */
  abstract revokeNaming(siteId: string, payerId: string, at: Date): Promise<void>;
}
