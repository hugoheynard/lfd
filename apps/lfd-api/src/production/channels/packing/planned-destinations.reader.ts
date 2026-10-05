/**
 * **La destination de chaque commande du plan arrêté** — port que le fournil
 * PUBLIE et implémente, que le colisage lit pour composer son poste (K3a).
 *
 * La liste à coliser (`PackingListDrawnEvent`) ne porte pas la destination,
 * contrairement à ce que le §17.1 du plan suppose (vérifié le 2026-10-05) :
 * c'est le fournil qui l'a figée dans son instantané à la clôture. Le colisage
 * la lui demande plutôt que d'en garder une copie qu'aucune ligne existante ne
 * porterait — étendre le fait et la table est l'autre voie, remontée au plan.
 */
export abstract class PlannedDestinationsReader {
  /**
   * La destination de chaque commande du plan de cette journée, par
   * identifiant opaque. Vide sur une journée non arrêtée.
   */
  abstract destinationsOf(serviceDay: string): Promise<ReadonlyMap<string, string>>;
}
