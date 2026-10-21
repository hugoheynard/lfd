import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { OrderTimeLimitNotFoundError } from "../domain/errors/order-time-limit-errors.js";
import { CatalogRulesEmitter } from "../domain/ports/catalog-rules.emitter.js";
import { OrderTimeLimitRepository } from "../domain/ports/order-time-limit.repository.js";
import { limitScopeLabel } from "../domain/services/limit-scope-label.js";
import { LimitScope } from "../domain/value-objects/limit-scope.js";

export class RemoveOrderTimeLimitCommand {
  constructor(readonly id: string) {}
}

/**
 * **Retire** la limite d'une portée.
 *
 * Supprimer EST le geste pour dire « ce produit n'a pas de limite propre » :
 * seule la règle générale du commerce le juge alors (depuis le 2026-10-21 ;
 * avant, l'article retombait sur un rang du dessus, qui n'existe plus).
 *
 * Une exception à « pas de DELETE physique », et elle est nommée : un réglage
 * n'est pas un agrégat métier. Il n'a ni cycle de vie, ni pièce comptable qui en
 * dépende. Ce qui remplace l'archivage, c'est **le journal** : après cette
 * ligne, il est le seul endroit où la règle a encore existé — d'où le fait qu'on
 * y verse ses trois valeurs avant de la retirer.
 *
 * ## Plus de garde sur le rang global (2026-10-21)
 *
 * Elle refusait de retirer « toute la production » sous des règles qui en
 * héritaient. Le référentiel n'a plus qu'une limite par produit, règle
 * entière, et la résolution ignore tout autre rang : retirer une ligne
 * résiduelle (globale, famille, déclinaison) ne change donc plus rien à ce qui
 * s'applique — c'est le geste qui les vide.
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
    private readonly rules: CatalogRulesEmitter,
  ) {}

  async execute(command: RemoveOrderTimeLimitCommand): Promise<void> {
    // Toutes les règles, résiduelles comprises : une ligne d'avant le
    // 2026-10-21 (globale, famille, déclinaison) doit pouvoir se retirer.
    const rules = await this.limits.list();
    const doomed = rules.find((rule) => rule.id === command.id);
    if (doomed === undefined) {
      throw new OrderTimeLimitNotFoundError(command.id);
    }

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.orderTimeLimitRemoved,
        subjectType: "order_time_limit",
        subjectId: doomed.id,
        // Ce que la règle disait, versé AVANT de la retirer — sans quoi le
        // journal n'attesterait que d'une suppression sans objet. La charge est
        // celle de `orderTimeLimitSet` : les deux faits se relisent ensemble
        // quand un client conteste, et deux formes obligeraient à les traduire.
        payload: {
          // La portée en mots, lue dans la vue qu'on vient de relire (lot B).
          subjectLabel: limitScopeLabel(doomed.scope, doomed.scopeLabel),
          scope: LimitScope.of(doomed.scope).key,
          daysBefore: doomed.daysBefore,
          time: doomed.time,
          graceMinutes: doomed.graceMinutes,
        },
      });
      await this.limits.remove(doomed.id, ticket);
      // L'échelle d'après, relue dans la transaction (lot 2b).
      await this.rules.emitRules();
    });
  }
}
