/**
 * D'où la carte « Planifier » lit ses tuiles (L10b-C6). Le type vit à part :
 * `map-tiles.config.ts` est REMPLACÉ en développement, et un fichier de
 * remplacement ne peut pas importer le fichier qu'il remplace.
 */
export interface MapTilesConfig {
  /** Le dossier qui porte `rues.pmtiles` et `relief.pmtiles`, `/` final compris ; `''` : pas de carte. */
  readonly baseUrl: string;
  /**
   * Lire chaque fichier EN ENTIER, une fois, puis servir les plages de la
   * mémoire. Réservé au découpage de développement (~10 Mo) : en production,
   * les plages partent au serveur.
   */
  readonly wholeFile: boolean;
}
