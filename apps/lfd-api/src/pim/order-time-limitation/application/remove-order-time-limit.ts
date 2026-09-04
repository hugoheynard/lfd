import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { OrderTimeLimitRepository } from "../domain/ports/order-time-limit.repository.js";

export class RemoveOrderTimeLimitCommand {
  constructor(readonly id: string) {}
}

/**
 * **Retire** la limite d'une portée.
 *
 * Supprimer EST le geste pour dire « ce rang ne se prononce pas » : l'article
 * retombe alors sur le rang du dessus. C'est aussi pourquoi une ligne aux trois
 * valeurs nulles est refusée à l'écriture — elle dirait la même chose en se
 * montrant à l'écran comme une règle.
 *
 * Une exception à « pas de DELETE physique », et elle est nommée : un réglage
 * n'est pas un agrégat métier. Il n'a ni cycle de vie, ni pièce comptable qui en
 * dépende. Ce qui remplace l'archivage, c'est **le journal** : après cette
 * ligne, il est le seul endroit où la règle a encore existé — d'où le fait qu'on
 * y verse ses trois valeurs avant de la retirer.
 */
@CommandHandler(RemoveOrderTimeLimitCommand)
export class RemoveOrderTimeLimitHandler implements ICommandHandler<
  RemoveOrderTimeLimitCommand,
  void
> {
  constructor(
    private readonly limits: OrderTimeLimitRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveOrderTimeLimitCommand): Promise<void> {
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.orderTimeLimitRemoved,
        subjectType: "order_time_limit",
        subjectId: command.id,
        payload: {},
      });
      await this.limits.remove(command.id, ticket);
    });
  }
}
