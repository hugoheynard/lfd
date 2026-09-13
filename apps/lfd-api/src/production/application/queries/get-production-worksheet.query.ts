/**
 * **La fiche d'atelier d'une journée.**
 *
 * Aucun acteur : la porte est le guard staff du contrôleur, comme pour l'état
 * d'une journée ou le prévisionnel. Le jour arrive en texte et c'est le domaine
 * qui le refuse s'il n'en est pas un — valider ici obligerait chaque appelant à
 * le refaire.
 */
export class GetProductionWorksheetQuery {
  constructor(readonly serviceDay: string) {}
}
