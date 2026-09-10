import type { BillingCycleView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { cycleAt } from "../../domain/services/billing-cycle.js";
import { GetCurrentBillingCycleQuery } from "./billing-cycle-queries.js";

/**
 * Rend le cycle qui contient l'instant courant.
 *
 * 🔴 `null` en clôture précédente, et ce n'est pas un raccourci : **aucune
 * clôture n'est encore enregistrée**. Le domaine se rabat alors sur le 1er du
 * mois courant, ce qui est exactement le cycle qu'on aurait si le calendrier
 * décidait. Le jour où les clôtures existent, seule cette ligne change — le
 * paramètre a été posé pour ça (vérifié le 2026-09-10 : rien n'écrit de
 * clôture dans `src/`).
 *
 * L'instant vient du port `Clock`, jamais de `new Date()` : c'est ce qui rend le
 * cycle éprouvable sur un passage à l'heure d'été sans attendre mars.
 */
@QueryHandler(GetCurrentBillingCycleQuery)
export class GetCurrentBillingCycleHandler implements IQueryHandler<
  GetCurrentBillingCycleQuery,
  BillingCycleView
> {
  constructor(private readonly clock: Clock) {}

  execute(): Promise<BillingCycleView> {
    const cycle = cycleAt(this.clock.now(), null);
    return Promise.resolve({
      startsAt: cycle.startsAt.toISOString(),
      closesAt: cycle.closesAt.toISOString(),
    });
  }
}
