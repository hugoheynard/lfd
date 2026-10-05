import type { StatementCycleView, StatementCyclesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { StatementMonth } from "../../domain/value-objects/statement-month.js";
import { ListStatementCyclesQuery } from "./cycle-statement-queries.js";

/**
 * Combien de mois le sélecteur propose : une année glissante, le mois en cours
 * compris. Au-delà, un relevé se demande par `?month=`.
 */
export const STATEMENT_CYCLES_LISTED = 12;

/**
 * Les derniers cycles de relevé, **mois civils**, le plus récent d'abord.
 *
 * ⚠️ Mois civils parce qu'aucune clôture n'est encore enregistrée (vérifié le
 * 2026-10-05 : `get-current-billing-cycle.handler.ts` passe toujours `null` en
 * clôture précédente). C'est exactement le cycle par défaut ; S4-0 devra poser
 * sa première clôture sur un 1er pour qu'aucun relevé déjà montré ne change.
 */
@QueryHandler(ListStatementCyclesQuery)
export class ListStatementCyclesHandler implements IQueryHandler<
  ListStatementCyclesQuery,
  StatementCyclesView
> {
  constructor(private readonly clock: Clock) {}

  execute(): Promise<StatementCyclesView> {
    const cycles: StatementCycleView[] = [];
    let month = StatementMonth.containing(this.clock.now());
    for (let rank = 0; rank < STATEMENT_CYCLES_LISTED; rank += 1) {
      const cycle = month.cycle();
      cycles.push({
        month: month.toString(),
        startsAt: cycle.startsAt.toISOString(),
        closesAt: cycle.closesAt.toISOString(),
        inProgress: rank === 0,
      });
      month = month.previous();
    }
    return Promise.resolve({ cycles });
  }
}
