import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { LeadScoreView } from "@lfd/contracts";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
import { CustomerNamer } from "../../domain/ports/customer-namer.js";
import { customerLabel } from "../handlers/order-fact-names.js";
import { LeadScoreReader } from "../../domain/ports/lead-score.reader.js";
import { GetCockpitQuery } from "./get-cockpit.query.js";

/** Taille de la queue cockpit — « les 5 meilleurs coups du jour ». */
const COCKPIT_SIZE = 5;

/**
 * Lit la queue top-5 du read-model, puis **journalise `reco.shown`** pour chaque
 * coup affiché — on capture dès maintenant ce qui a été montré au commercial (la
 * boucle fermée `reco.shown → action → outcome` sera exploitée en Phase 2). La
 * journalisation est **best-effort** (le recorder n'échoue jamais vers l'appelant)
 * et **idempotente par (sujet, fenêtre de recompute)** : rafraîchir le cockpit
 * dans la même fenêtre ne recompte pas l'affichage.
 *
 * Le prospect est cité par son id (le sujet) et par son NOM quand il en a un
 * (`subjectLabel`) — jamais par le libellé du cockpit tel quel : pour une
 * personne sans nom, ce libellé est son e-mail (`lead-score.ts`), et une
 * coordonnée n'entre pas au journal (lot B du plan des phrases, 2026-09-19).
 */
@QueryHandler(GetCockpitQuery)
export class GetCockpitHandler implements IQueryHandler<GetCockpitQuery, LeadScoreView[]> {
  constructor(
    private readonly reader: LeadScoreReader,
    private readonly recorder: ActivityRecorder,
    private readonly customers: CustomerNamer,
  ) {}

  async execute(): Promise<LeadScoreView[]> {
    const leads = await this.reader.topPlays(COCKPIT_SIZE);
    // Les noms d'abord, les écritures ensuite : les faits partent dans l'ordre
    // de la queue, quel que soit le temps que met chaque nom à se lire.
    const labels = await Promise.all(leads.map((lead) => this.labelOf(lead)));
    await Promise.all(leads.map((lead, index) => this.logShown(lead, labels[index] ?? {})));
    return leads;
  }

  private logShown(lead: LeadScoreView, label: { readonly subjectLabel?: string }): Promise<void> {
    return this.recorder.record({
      type: ACTIVITY_TYPES.recoShown,
      subjectType: lead.subjectType,
      subjectId: lead.subjectId,
      idempotencyKey: `${ACTIVITY_TYPES.recoShown}:${lead.subjectType}:${lead.subjectId}:${lead.computedAt}`,
      payload: {
        ...label,
        play: lead.play,
        score: lead.score,
      },
    });
  }

  /**
   * Le nom du prospect : une personne se nomme par sa fiche (le libellé du
   * cockpit serait son e-mail) ; une société ou un prospect saisi, par le
   * libellé du read-model — son enseigne —, sauf quand il n'est que l'id
   * faute de nom (`deriveActivations`).
   */
  private async labelOf(lead: LeadScoreView): Promise<{ readonly subjectLabel?: string }> {
    if (lead.subjectType === "user") {
      // Best-effort : un annuaire illisible prive la ligne d'un nom, sans plus.
      return customerLabel(this.customers, lead.subjectId);
    }
    return lead.label === "" || lead.label === lead.subjectId ? {} : { subjectLabel: lead.label };
  }
}
