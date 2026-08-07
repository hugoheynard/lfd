import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { LeadScoreView } from "@lfd/contracts";
import { ACTIVITY_TYPES } from "../../domain/activity-event.js";
import { ActivityRecorder } from "../../domain/ports/activity-recorder.js";
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
 */
@QueryHandler(GetCockpitQuery)
export class GetCockpitHandler implements IQueryHandler<GetCockpitQuery, LeadScoreView[]> {
  constructor(
    private readonly reader: LeadScoreReader,
    private readonly recorder: ActivityRecorder,
  ) {}

  async execute(): Promise<LeadScoreView[]> {
    const leads = await this.reader.topPlays(COCKPIT_SIZE);
    await Promise.all(leads.map((lead) => this.logShown(lead)));
    return leads;
  }

  private logShown(lead: LeadScoreView): Promise<void> {
    return this.recorder.record({
      type: ACTIVITY_TYPES.recoShown,
      subjectType: lead.subjectType,
      subjectId: lead.subjectId,
      idempotencyKey: `${ACTIVITY_TYPES.recoShown}:${lead.subjectType}:${lead.subjectId}:${lead.computedAt}`,
      payload: { play: lead.play, score: lead.score },
    });
  }
}
