import type { StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { BasketBuyerStanding } from "../../../channels/commerce/basket-buyer-standing.js";
import type { PlannedColumnIssueFact } from "./planned-column-facts.js";

/** Ceux qui gèrent les commandes automatiques des pros : la notice leur est adressée. */
const AUDIENCE: StaffPermission = "b2b_subscriptions:read";
const KIND_REFUSED = "recurring.planned_column_refused";
const KIND_MISSED = "recurring.planned_column_missed";

/** Ce que dit une colonne manquée : aucune phrase de refus, la machine n'a pas tourné. */
const MISSED_BODY =
  "Le planificateur n'a pas tourné avant la fermeture de ce jour : aucune commande n'est " +
  "partie. Appelez le client, et passez la commande à sa place si le jour est encore ouvert.";

/** « lundi 8 décembre » : le jour de service lu comme le staff le dit. */
const DAY_LABEL = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/**
 * **La cloche d'une commande planifiée non passée** (plan du planificateur,
 * § 5) : un refus ou un manqué sonne pour ceux qui gèrent les paniers
 * récurrents, et pour eux seuls — le client n'est pas prévenu par e-mail
 * (Q8) : sa colonne le dit, et le staff appelle.
 *
 * La phrase d'un refus est celle de la passation, qui nomme le cas et le
 * geste de sortie. Le lien ouvre la fiche de la société. Une notice par
 * fait : la clé du fait fait l'anti-doublon.
 */
@Injectable()
export class PlannedColumnIssueBell {
  constructor(
    private readonly notifier: StaffNotifier,
    private readonly buyers: BasketBuyerStanding,
  ) {}

  async ring(fact: PlannedColumnIssueFact, at: Date): Promise<void> {
    const company = (await this.buyers.companyName(fact.companyId)) ?? fact.companyId;
    const day = DAY_LABEL.format(new Date(`${fact.serviceDay}T00:00:00.000Z`));
    const { issue } = fact;
    await this.notifier.notify([
      {
        kind: issue.kind === "missed" ? KIND_MISSED : KIND_REFUSED,
        subject:
          issue.kind === "missed"
            ? `Commande planifiée manquée — ${company}, ${day}`
            : `Commande planifiée non passée — ${company}, ${day}`,
        body: issue.kind === "missed" ? MISSED_BODY : issue.reason,
        link: `/comptes-clients/${fact.companyId}`,
        idempotencyKey: `notification:${fact.durableFact().key}`,
        occurredAt: at,
        audience: AUDIENCE,
      },
    ]);
  }
}
