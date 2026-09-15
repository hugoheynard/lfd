/**
 * Port d'**écriture** du verrou du créancier imprimé : le premier mandat frappé
 * sous une entité émettrice. Déclaré ET implémenté par la comptabilité, consommé
 * par la frappe (`payments`) — plan `documentation/comptabilite/plan-restes-du-mandat.md`
 * §3, corrigé par le §7 #6.
 *
 * ## Pourquoi une écriture ciblée, et pas `load` → méthode → `save`
 *
 * Même raisonnement que `OrderRepository.markPaid` : c'est une **projection
 * conditionnée en base**, sans invariant de plus à charger. La seule règle —
 * « c'est le PREMIER qui compte » — tient entière dans le `WHERE
 * first_mandate_issued_at IS NULL`, et elle y tient mieux que dans l'agrégat :
 *
 * - une load→save réécrirait **toute** la ligne, et un geste staff concurrent
 *   (corriger l'identité, régler le schéma) qui aurait chargé l'entité avant la
 *   frappe remettrait le verrou à `null` en sauvant. C'est pourquoi la colonne
 *   est aussi retirée de ce que `save` écrit (`legalEntityColumns`) : personne
 *   d'autre que ce port ne la touche, donc personne ne peut l'effacer ;
 * - une seconde frappe ne matche aucune ligne : le moment du gel ne se déplace
 *   pas, sans relecture et sans course.
 *
 * Pas d'abonné à un événement : il tournerait hors de la transaction de la
 * frappe, et l'événement de frappe ne porte pas l'émetteur. Le verrou et le
 * mandat s'écrivent ensemble, ou pas du tout.
 *
 * Exporté SEUL, et pas `LegalEntityRepository` : `payments` reçoit le droit de
 * poser ce fait-là, pas celui de charger et muter l'entité.
 */
export abstract class FirstMandateLedger {
  /**
   * Note qu'un mandat vient d'être frappé sous cet émetteur. **Idempotent** :
   * sans effet si le verrou est déjà posé, ou si l'entité est inconnue.
   *
   * À appeler dans l'unité de travail de la frappe.
   */
  abstract note(creditorId: string, at: Date): Promise<void>;
}
