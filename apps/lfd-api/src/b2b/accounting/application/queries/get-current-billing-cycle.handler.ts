import type { BillingCycleView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { RecordedClosureReader } from "../../domain/ports/recorded-closure.reader.js";
import { cycleAt } from "../../domain/services/billing-cycle.js";
import { GetCurrentBillingCycleQuery } from "./billing-cycle-queries.js";

/**
 * Rend le cycle qui contient l'instant courant.
 *
 * La clôture précédente est la dernière ENREGISTRÉE — celle du dernier lot
 * vivant, toutes entités confondues : la route ne nomme pas d'entité, et une
 * seule encaisse (Q4 du plan `plan-lot-de-prelevement-fige.md`, 2026-10-05).
 * Sans lot, `null` : le cycle se rabat sur le 1er du mois courant.
 *
 * L'instant vient du port `Clock`, jamais de `new Date()` : c'est ce qui rend le
 * cycle éprouvable sur un passage à l'heure d'été sans attendre mars.
 */
@QueryHandler(GetCurrentBillingCycleQuery)
export class GetCurrentBillingCycleHandler implements IQueryHandler<
  GetCurrentBillingCycleQuery,
  BillingCycleView
> {
  constructor(
    private readonly clock: Clock,
    private readonly closures: RecordedClosureReader,
  ) {}

  async execute(): Promise<BillingCycleView> {
    const cycle = cycleAt(this.clock.now(), await this.closures.lastClosure(null));
    return {
      startsAt: cycle.startsAt.toISOString(),
      closesAt: cycle.closesAt.toISOString(),
    };
  }
}
