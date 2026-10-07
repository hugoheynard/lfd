/**
 * **Ce que la production répond au retrait** : lesquelles de ces commandes
 * n'ont PAS de feuille d'atelier ce jour-là — la retardataire, passée après la
 * clôture (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 1).
 *
 * Même figure que `QualityHoldsReader`, rangé à côté : la production PUBLIE et
 * implémente, le retrait lit. La feuille d'atelier est un fait de la
 * production (`production_order`), et `production → handover` est interdit —
 * c'est au retrait de venir poser la question.
 *
 * ## Pourquoi « sans feuille » n'est vrai qu'une journée CLOSE
 *
 * Avant la clôture, AUCUNE commande n'a de feuille : le plan n'est pas encore
 * arrêté. Les déclarer toutes « sans feuille » ferait crier la feuille de
 * route sur chaque arrêt de demain, et le signal de la retardataire — le sac
 * qu'on oublie le plus — se noierait dans le bruit. Une journée ouverte rend
 * donc l'ensemble vide : personne n'est encore en retard sur un plan qui
 * n'existe pas.
 *
 * Une journée reprise (`retake`) absorbe les arrivées dans le plan : celles-là
 * ont alors leur feuille, et ne sont plus rendues.
 *
 * ## Par lot, jamais une commande à la fois
 *
 * Une question pour toute la feuille de route, comme la file du comptoir.
 */
export abstract class AtelierSheetsReader {
  /**
   * Le sous-ensemble de `orderIds` qu'une journée CLOSE ne porte pas dans son
   * plan. Vide si la journée n'est pas close (ou n'existe pas).
   *
   * @param serviceDay jour de service `AAAA-MM-JJ`.
   * @param orderIds identifiants opaques du commerce.
   */
  abstract withoutSheet(
    serviceDay: string,
    orderIds: readonly string[],
  ): Promise<ReadonlySet<string>>;
}
