/** Port de **lecture** du nom des points de retrait, pour l'écran du fournil. */
export abstract class ResupplySiteLabels {
  /** Le nom de chaque point connu, archivés compris ; un id inconnu est absent de la table. */
  abstract labelsOf(siteIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
