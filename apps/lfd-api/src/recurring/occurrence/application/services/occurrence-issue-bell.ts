import type { StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { BasketBuyerStanding } from "../../../channels/commerce/basket-buyer-standing.js";
import type { RecurringOccurrenceFact } from "../../../channels/commerce/occurrence-facts.js";

/** Ceux qui gèrent les paniers récurrents : la notice leur est adressée. */
const AUDIENCE: StaffPermission = "b2b_subscriptions:read";
const KIND_REFUSED = "recurring.occurrence_refused";
const KIND_MISSED = "recurring.occurrence_missed";

/** « lundi 8 décembre » : le jour de service lu comme le staff le dit. */
const DAY_LABEL = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/**
 * **La cloche d'une échéance non passée** (plan du planificateur, R5) : un
 * refus dont la cause est nouvelle, ou une échéance manquée, sonnent pour
 * ceux qui gèrent les paniers récurrents — et pour eux seuls (décision de
 * Hugo, Q5 : le client n'est pas prévenu, le commercial appelle).
 *
 * La phrase est celle du refus, qui nomme le cas et le geste de sortie ; le
 * lien ouvre les paniers de la société sur sa fiche. Une notice par fait :
 * la clé du fait fait l'anti-doublon, un fait rejoué ne sonne pas deux fois.
 */
@Injectable()
export class OccurrenceIssueBell {
  constructor(
    private readonly notifier: StaffNotifier,
    private readonly buyers: BasketBuyerStanding,
  ) {}

  async ring(fact: RecurringOccurrenceFact, at: Date): Promise<void> {
    const outcome = fact.outcome;
    if (outcome.kind === "placed") {
      return;
    }
    const company = (await this.buyers.companyName(fact.companyId)) ?? fact.companyId;
    const day = DAY_LABEL.format(new Date(`${fact.serviceDay}T00:00:00.000Z`));
    const missed = outcome.kind === "missed";
    await this.notifier.notify([
      {
        kind: missed ? KIND_MISSED : KIND_REFUSED,
        subject: missed
          ? `Commande récurrente manquée — ${company}, ${day}`
          : `Commande récurrente non passée — ${company}, ${day}`,
        body: outcome.reason,
        link: `/comptes-clients/${fact.companyId}/paniers-recurrents`,
        // La clé du fait : refusée, une par cause nouvelle ; manquée, une seule.
        idempotencyKey: `notification:${fact.durableFact().key}`,
        occurredAt: at,
        audience: AUDIENCE,
      },
    ]);
  }
}
