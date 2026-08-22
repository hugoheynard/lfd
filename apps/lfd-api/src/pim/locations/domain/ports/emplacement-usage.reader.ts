/**
 * Ce qui référence un emplacement **hors de ce contexte**.
 *
 * Un port plutôt qu'une requête directe sur la table des familles : le contexte
 * `locations` ne connaît pas le catalogue, et n'a aucune raison de savoir que
 * les canaux d'une gamme vivent dans une colonne `jsonb`. Il pose une question
 * — « est-ce que quelqu'un s'en sert ? » — et quelqu'un d'autre sait y répondre.
 */
export abstract class EmplacementUsageReader {
  /**
   * Combien de **familles** cochent cet emplacement dans leur grille de canaux.
   *
   * Sert le refus de suppression : un point de vente encore vendeur ne se
   * supprime pas sous les fiches qui s'y vendent. C'est la même protection que
   * le `RESTRICT` des taux de TVA — sauf qu'ici la référence vit dans un `jsonb`,
   * donc aucune clé étrangère ne peut la tenir, et le domaine doit le faire.
   */
  abstract countCategoriesUsing(emplacementId: string): Promise<number>;

  /**
   * Le même compte, **pour tous les emplacements**, en une lecture.
   *
   * Sert la LISTE, pas un invariant : l'écran doit pouvoir dire « 3 familles
   * s'y vendent » AVANT qu'on clique sur Supprimer, plutôt que de laisser le
   * refus l'apprendre après. La version unitaire garde l'invariant à
   * l'écriture ; les appeler en boucle ferait N lectures pour peupler une
   * liste. C'est le découpage de `ProductCountReader`, côté catalogue.
   *
   * Les emplacements que personne ne coche sont **absents** de la table : un
   * lecteur lit `?? 0`, il ne suppose pas la présence de la clé.
   */
  abstract countByEmplacement(): Promise<ReadonlyMap<string, number>>;
}
