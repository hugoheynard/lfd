/**
 * **Le poste de colisage d'une journée** — les bacs ET la ressource.
 *
 * Une seule lecture pour les deux plateaux de la balance : ils n'ont de sens que
 * pris au même instant. Deux requêtes laisseraient une fenêtre où le reste
 * affiché ne correspondrait à aucun état réel.
 *
 * Aucun acteur : la porte est le guard staff du contrôleur, comme pour la fiche
 * d'atelier. Le jour arrive en texte et c'est le domaine qui le refuse s'il n'en
 * est pas un — valider ici obligerait chaque appelant à le refaire.
 */
export class GetProductionPackingQuery {
  constructor(readonly serviceDay: string) {}
}
