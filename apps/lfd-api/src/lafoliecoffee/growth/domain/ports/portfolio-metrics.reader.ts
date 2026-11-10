import type { PortfolioMetricsView } from "@lfd/contracts";

/**
 * Port de lecture de l'**état du portefeuille** : combien de comptes servis,
 * combien viennent d'entrer, lesquels montent ou descendent, et ce qui reste à
 * encaisser.
 *
 * `now` est **fourni par l'appelant**. Les deux fenêtres de 30 jours doivent
 * être découpées sur le même instant : les recalculer dans l'adaptateur
 * laisserait deux requêtes se référer à deux « maintenant » différents, et un
 * compte pourrait tomber dans les deux fenêtres à la fois.
 */
export abstract class PortfolioMetricsReader {
  abstract load(now: Date): Promise<PortfolioMetricsView>;
}
