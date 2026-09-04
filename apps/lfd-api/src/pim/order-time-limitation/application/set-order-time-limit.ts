import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { OrderTimeLimitPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PimIdGenerator } from "../../infra/id/pim-id-generator.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { OrderTimeLimit } from "../domain/entities/order-time-limit.js";
import { OrderTimeLimitRepository } from "../domain/ports/order-time-limit.repository.js";
import { LimitScope } from "../domain/value-objects/limit-scope.js";

export class SetOrderTimeLimitCommand {
  constructor(readonly payload: OrderTimeLimitPayload) {}
}

/**
 * **Pose** la limite d'une portée — création ou remplacement.
 *
 * Un seul cas d'usage pour les deux, parce qu'il n'y a **qu'une règle par
 * portée** : un `create` distinct aurait exigé de l'appelant qu'il sache
 * d'abord si la portée est déjà servie, et se serait donc trompé une fois sur
 * deux. L'écran pose une valeur ; le serveur sait si c'est la première.
 *
 * L'identifiant vient de la commande (R1), jamais de la base — et seulement
 * quand il en faut un neuf : remplacer garde l'identifiant existant, sans quoi
 * un simple changement d'heure ferait disparaître la ligne et en créerait une
 * autre sous les yeux de qui la regardait.
 */
@CommandHandler(SetOrderTimeLimitCommand)
export class SetOrderTimeLimitHandler implements ICommandHandler<SetOrderTimeLimitCommand, string> {
  constructor(
    private readonly limits: OrderTimeLimitRepository,
    @Inject(PimIdGenerator) private readonly ids: PimIdGenerator,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetOrderTimeLimitCommand): Promise<string> {
    const { payload } = command;
    // La portée se valide AVANT la lecture : chercher une règle sur une portée
    // qui se contredit reviendrait à interroger la base avec une question qui
    // n'en est pas une.
    const scope = LimitScope.of(payload.scope);
    const existing = await this.limits.findByScope(scope);

    // L'agrégat naît (ou se réécrit) AVANT la trace : il refuse une règle qui
    // ne dit rien, et journaliser un fait qu'on va ensuite rejeter laisserait
    // dans le journal une décision qui n'a jamais eu lieu.
    const limit = existing ?? OrderTimeLimit.set(this.ids.next(), payload);
    if (existing !== null) {
      existing.reset(payload);
    }

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.orderTimeLimitSet,
        subjectType: "order_time_limit",
        subjectId: limit.id,
        // La portée ET les trois valeurs : c'est un réglage, et « qui a changé
        // ça » ne se répond qu'en sachant ce que ça valait. `null` y reste
        // `null` — « ce rang ne se prononce pas » est une décision, pas un vide.
        payload: {
          scope: limit.scope.key,
          daysBefore: limit.daysBefore,
          time: limit.time,
          graceMinutes: limit.graceMinutes,
        },
      });
      await this.limits.save(limit, ticket);
    });
    return limit.id;
  }
}
