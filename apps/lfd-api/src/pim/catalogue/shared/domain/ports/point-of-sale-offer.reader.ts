/**
 * **Ce que chaque point de vente offre** — la face manquante d'un mur à une
 * seule face.
 *
 * Deux invariants tiennent par ce port, et aucun des deux ne se garde tout
 * seul :
 *
 * 1. **Le point de vente existe.** La matrice le cite par identifiant ; le mur
 *    inverse (`Restrict`) refuse de le supprimer sous une famille qui le vend,
 *    mais rien ne gardait le sens direct. C'est la panne « Ardroit » : une
 *    boutique proposée à l'écran qui ne correspondait à aucune ligne.
 * 2. **Il offre ce contexte.** Une famille pouvait vendre « sur place » depuis
 *    une boutique sans salle : la projection fabriquait alors une fiche pour un
 *    lieu qui ne sert pas. L'offre borne les cases cochables, et c'est ici
 *    qu'elle le fait.
 */
export abstract class PointOfSaleOfferReader {
  /**
   * Pour chaque identifiant demandé, les clés de contexte qu'il offre.
   *
   * Un point de vente **absent** de la table rendue n'existe pas — à ne pas
   * confondre avec un point de vente présent qui n'offre rien.
   */
  abstract offersOf(ids: readonly string[]): Promise<ReadonlyMap<string, ReadonlySet<string>>>;
}
