import type { ProductionPlanClosure } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { CloseProductionPlanCommand } from "./close-production-plan.command.js";

/**
 * **La clôture du plan du soir** — le moment où une journée bascule en
 * production.
 *
 * ## Ce qu'elle répare
 *
 * `confirmed` était une valeur que la base acceptait et que **personne
 * n'écrivait**. Une commande naissait `placed` et le restait jusqu'au colisage :
 * entre les deux, rien ne distinguait ce qui allait être fabriqué de ce qui
 * venait d'arriver. Le fournil le savait — le système, non.
 *
 * ## Pourquoi une commande, alors que le dossier dit « pas un clic »
 *
 * ⚠️ **C'est une inflexion de la conception, et elle mérite d'être dite.** Le
 * dossier du cycle de vie écrit que `confirmed` est automatique et que
 * « personne ne doit cliquer ». Les deux façons d'y arriver sans geste humain
 * sont fermées :
 *
 * - **une tâche planifiée** — l'API n'a aucun planificateur, et en introduire un
 *   pour cette seule bascule ajouterait un mécanisme à surveiller ;
 * - **une écriture sur la lecture du lot** — interdite : « une requête de
 *   lecture n'écrit rien, pas même un compteur ».
 *
 * Reste le geste que l'équipe fait **déjà** : arrêter de prendre pour demain et
 * lancer la nuit. Ce que le dossier refuse, c'est une décision **par commande** ;
 * une bascule **par journée** ne demande à personne de juger quoi que ce soit —
 * elle acte une heure, pas un tri. C'est cette lecture-là qui est retenue.
 *
 * ## Idempotente par sa règle
 *
 * La condition d'état vit dans `absorbedByPlan` et se transcrit dans le `where`.
 * Clore deux fois la même journée absorbe **zéro** la seconde fois, sans garde
 * ajouté — et le compte rendu le dit plutôt que de refuser : la journée était
 * déjà basculée, ce qui est une information, pas une erreur.
 */
@CommandHandler(CloseProductionPlanCommand)
export class CloseProductionPlanHandler implements ICommandHandler<
  CloseProductionPlanCommand,
  ProductionPlanClosure
> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: CloseProductionPlanCommand): Promise<ProductionPlanClosure> {
    const absorbed = await this.orders.absorbIntoPlan(command.serviceDay, this.clock.now());
    return { date: command.serviceDay, absorbed };
  }
}
