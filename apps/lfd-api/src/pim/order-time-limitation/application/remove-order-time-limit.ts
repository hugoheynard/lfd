import { ORDER_TIME_LIMIT_SCOPE_LABELS, type OrderTimeLimitView } from "@lfd/pim-contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import {
  GlobalOrderTimeLimitStillNeededError,
  OrderTimeLimitNotFoundError,
} from "../domain/errors/order-time-limit-errors.js";
import { OrderTimeLimitRepository } from "../domain/ports/order-time-limit.repository.js";
import { LimitScope } from "../domain/value-objects/limit-scope.js";

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
 *
 * ## 🔴 Le rang global ne se retire pas sous les autres
 *
 * L'héritage se fait champ par champ. Une famille qui ne pose que l'heure
 * emprunte son délai au global, et la résolution rend `null` dès qu'un des deux
 * manque : retirer le global rendrait ces règles **muettes**, pas plus
 * permissives — et l'écran continuerait de les afficher comme si elles
 * s'appliquaient.
 *
 * C'est un **refus**, pas une consigne, et c'est délibéré : la garde du commerce
 * (`OrderCutoff`) s'efface derrière l'échelle, ce qui fait du rang global la
 * seule chose qui refuse une commande en retard pour un article dont personne
 * n'a parlé. Un `DELETE` sans garde suffisait à ouvrir toute la plateforme, en
 * silence. Cf. `documentation/order/demontage-order-cutoff.md`.
 *
 * ⚠️ Ce que ce refus ne couvre pas, et qui reste voulu : retirer un rang global
 * **seul de son espèce** passe. Il n'y a alors rien à rendre muet, et « je
 * n'oppose plus de limite » est un état légitime — écrit dans la garde. Ce
 * qu'on ferme, c'est de le faire sans le voir.
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
    // Toutes les règles d'un coup : il en faut le contenu de celle qu'on retire
    // (pour le journal) ET celui des autres (pour le refus). Deux lectures
    // séparées auraient pu se contredire entre elles.
    const rules = await this.limits.list();
    const doomed = rules.find((rule) => rule.id === command.id);
    if (doomed === undefined) {
      throw new OrderTimeLimitNotFoundError(command.id);
    }
    if (doomed.scope.type === "global") {
      const dependents = orphanedBy(rules, doomed);
      if (dependents.length > 0) {
        throw new GlobalOrderTimeLimitStillNeededError(dependents);
      }
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
          scope: LimitScope.of(doomed.scope).key,
          daysBefore: doomed.daysBefore,
          time: doomed.time,
          graceMinutes: doomed.graceMinutes,
        },
      });
      await this.limits.remove(doomed.id, ticket);
    });
  }
}

/**
 * Les règles qui deviendraient muettes si `doomed` partait, **nommées**.
 *
 * Le critère est celui de la résolution, pas une approximation : une règle
 * survit seule si elle pose **le délai ET l'heure**. Celle qui n'en pose qu'un
 * les complète par un rang supérieur — et le seul rang supérieur du global,
 * c'est rien.
 */
function orphanedBy(
  rules: readonly OrderTimeLimitView[],
  doomed: OrderTimeLimitView,
): readonly string[] {
  return rules
    .filter((rule) => rule.id !== doomed.id && (rule.daysBefore === null || rule.time === null))
    .map((rule) => rule.scopeLabel ?? ORDER_TIME_LIMIT_SCOPE_LABELS[rule.scope.type]);
}
