import type { ProductionPlanClosure } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DayOrdersReader } from "../../channels/commerce/day-orders.reader.js";
import { ProductionDayClosedEvent } from "../../channels/commerce/production-day-closed.event.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { CloseProductionDayCommand } from "./close-production-day.command.js";

/**
 * **La clôture du plan du soir** — le moment où une journée bascule.
 *
 * ## Ce que ce handler fait, et ce qu'il ne fait PAS
 *
 * Il charge l'agrégat, lui demande de se clore, l'écrit, et **publie**. Il
 * n'écrit rien chez le commerce : `confirmed` est un fait du commerce, tiré du
 * nôtre par un abonné qui vit chez lui. Chaque contexte n'écrit que ses tables.
 *
 * ## Pourquoi une commande, alors que le dossier dit « pas un clic »
 *
 * ⚠️ Inflexion de conception héritée de la version précédente, et elle vaut
 * toujours. Le dossier du cycle de vie écrit que `confirmed` est automatique.
 * Les deux façons d'y arriver sans geste humain sont fermées : l'API n'a aucun
 * planificateur, et une écriture sur la lecture du lot est interdite — « une
 * requête de lecture n'écrit rien, pas même un compteur ».
 *
 * Reste le geste que l'équipe fait déjà : arrêter de prendre pour demain. Ce que
 * le dossier refuse est une décision **par commande** ; une bascule **par
 * journée** n'demande à personne de juger — elle acte une heure, pas un tri.
 *
 * ## La réannonce, et pourquoi elle n'est pas un « close » de plus
 *
 * Rejouer la clôture ne recalcule RIEN : l'agrégat refuse, parce que le compte à
 * produire est un instantané et que les commandes bougent après. Mais le fait
 * est **republié**, et c'est délibéré — le bus vit en processus, l'événement
 * n'est ni persisté ni rejoué, donc un abonné qui a échoué laisserait des
 * commandes `placed` sur une journée close. Presser à nouveau le bouton est le
 * rattrapage, et il est sans danger parce que `absorbIntoPlan` est idempotent.
 *
 * La réponse dit laquelle des deux choses vient d'arriver, plutôt que de rendre
 * deux fois le même nombre sans dire pourquoi.
 */
@CommandHandler(CloseProductionDayCommand)
export class CloseProductionDayHandler implements ICommandHandler<
  CloseProductionDayCommand,
  ProductionPlanClosure
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly orders: DayOrdersReader,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(command: CloseProductionDayCommand): Promise<ProductionPlanClosure> {
    const day = ServiceDay.of(command.serviceDay);
    const current = await this.days.load(day);

    if (current.isClosed) {
      return this.announce(day, current.closedAt, current.orders.length, true);
    }

    // Les commandes sont lues APRÈS le chargement de la journée : si elle est
    // déjà close, on ne les demande pas du tout — une requête de moins, et
    // surtout aucun risque de croire qu'on a lu ce qu'on va écrire.
    const producible = await this.orders.producibleFor(day);
    current.close(producible, this.clock.now());
    await this.days.save(current);

    return this.announce(day, current.closedAt, current.orders.length, false);
  }

  /** Publie le fait et rend le compte rendu. L'instant est celui du SNAPSHOT. */
  private announce(
    day: ServiceDay,
    closedAt: Date | null,
    orderCount: number,
    alreadyClosed: boolean,
  ): ProductionPlanClosure {
    // `closedAt` ne peut pas être nul ici — l'agrégat vient de se clore, ou
    // l'était déjà. On le traite quand même plutôt que de l'affirmer : un
    // `!` dirait au compilateur de se taire sur la seule chose qu'il sait.
    const at = closedAt ?? this.clock.now();
    this.events.publish(new ProductionDayClosedEvent(day.value, at, orderCount));
    return {
      date: day.value,
      absorbed: orderCount,
      alreadyClosed,
      closedAt: at.toISOString(),
    };
  }
}
