/**
 * Ce qui référence un emplacement **hors de ce contexte**.
 *
 * Un port plutôt qu'une requête directe sur la table des familles : le contexte
 * `locations` ne connaît pas le catalogue, et n'a aucune raison de savoir où
 * cette référence est écrite.
 *
 * Il ne porte plus qu'une LECTURE D'ÉCRAN. Il portait aussi le contrôle qui
 * protégeait la suppression — un compte, puis un refus dans le handler. Ce
 * contrôle ne tenait rien : entre le compte et la suppression, une grille
 * pouvait se mettre à citer l'emplacement. Le mur est désormais la clé
 * étrangère `Restrict` de `category_location_ref`, et le dépôt la traduit.
 */
export abstract class LocationUsageReader {
  /**
   * Combien de **familles** citent chaque emplacement, pour toute la liste en
   * une lecture.
   *
   * Sert l'écran, pas un invariant : il doit pouvoir dire « 3 familles s'y
   * vendent » AVANT qu'on clique sur Supprimer, plutôt que de laisser le refus
   * l'apprendre après. Un compte lu ici peut être périmé d'une seconde — c'est
   * sans conséquence, puisque ce n'est plus lui qui protège.
   *
   * Les emplacements que personne ne cite sont **absents** de la table : un
   * lecteur lit `?? 0`, il ne suppose pas la présence de la clé.
   */
  abstract countByLocation(): Promise<ReadonlyMap<string, number>>;
}
