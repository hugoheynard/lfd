import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Le plan de production de cette journée est arrêté** — refus métier (409),
 * pour le client comme pour l'équipe (plan
 * `documentation/commandes/passation/plan-reglages-commandes.md`, §8, point 3, lot O3).
 *
 * L'arrêt du plan est une limite à part entière depuis le 2026-10-14 : le
 * fournil a compté ses commandes, une commande de plus ne serait ni fabriquée
 * ni préparée. Avant, elle passait (observation O5) et n'existait que pour le
 * client.
 *
 * Le message nomme le geste de sortie : une autre journée. Il ne renvoie pas
 * au téléphone — une journée retirée reste arrêtée, et personne ne peut la
 * rouvrir à la demande (S7, à confirmer par Hugo).
 */
export class ProductionPlanClosedError extends BusinessError {
  constructor(readonly fulfillmentDate: string) {
    super(
      "orders.production_plan_closed",
      "Le plan de production de cette journée est déjà arrêté : le fournil a compté ses commandes, et celle-ci n'y entrerait plus. Choisissez une journée suivante.",
    );
  }
}
