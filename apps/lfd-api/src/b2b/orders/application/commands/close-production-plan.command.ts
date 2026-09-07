/**
 * **Clôt le plan du soir** d'une journée de service : ses commandes entrent dans
 * le compte à produire.
 *
 * Aucune liste de commandes en paramètre, et c'est le sujet : on ne choisit pas
 * ce qui part en production, on arrête de prendre. Ce que la journée contient au
 * moment où on la clôt EST le plan.
 */
export class CloseProductionPlanCommand {
  constructor(readonly serviceDay: string) {}
}
