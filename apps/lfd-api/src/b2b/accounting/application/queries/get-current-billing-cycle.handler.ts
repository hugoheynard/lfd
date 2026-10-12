import type { BillingCycleView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { BillingRhythmReader } from "../../domain/ports/billing-rhythm.reader.js";
import { InvoiceIssuersReader } from "../../domain/ports/invoice-issuers.reader.js";
import { RecordedClosureReader } from "../../domain/ports/recorded-closure.reader.js";
import { entityCycleAt } from "../../domain/services/entity-closures.js";
import { statementTimeline } from "../statement-period-support.js";
import { GetCurrentBillingCycleQuery } from "./billing-cycle-queries.js";

/**
 * Rend le cycle qui contient l'instant courant, **au rythme de l'entité en
 * service** (plan `plan-rythme-de-facturation.md`, §14, R5).
 *
 * La clôture précédente est la dernière ENREGISTRÉE — celle du dernier lot
 * vivant, toutes entités confondues : la route ne nomme pas d'entité, et une
 * seule encaisse (Q4 du plan `lot-de-prelevement-fige.md`, 2026-10-05) ; c'est
 * aussi elle dont le rythme est lu (`statementTimeline`). Sans lot, la
 * clôture du rythme qui précède.
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
    private readonly issuers: InvoiceIssuersReader,
    private readonly rhythms: BillingRhythmReader,
  ) {}

  async execute(): Promise<BillingCycleView> {
    const timeline = await statementTimeline({ issuers: this.issuers, rhythms: this.rhythms });
    const cycle = entityCycleAt(this.clock.now(), timeline, await this.closures.lastClosure(null));
    return {
      startsAt: cycle.startsAt.toISOString(),
      closesAt: cycle.closesAt.toISOString(),
    };
  }
}
