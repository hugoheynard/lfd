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
 *
 * Le sujet est cité par son id et par son NOM quand il en a un
 * (`subjectLabel`) : l'enseigne d'une société ou d'un lead démarché. Le
 * cockpit ne montre plus de personne depuis le lot P3 (2026-10-25) — dont le
 * libellé était l'e-mail, qu'il fallait tenir hors du journal.
 */
@QueryHandler(GetCockpitQuery)
export class GetCockpitHandler implements IQueryHandler<GetCockpitQuery, LeadScoreView[]> {
  constructor(
    private readonly reader: LeadScoreReader,
    private readonly recorder: ActivityRecorder,
  ) {}

  async execute(): Promise<LeadScoreView[]> {
    const leads = await this.reader.topPlays(COCKPIT_SIZE);
    await Promise.all(leads.map((lead) => this.logShown(lead, labelOf(lead))));
    return leads;
  }

  private logShown(lead: LeadScoreView, label: { readonly subjectLabel?: string }): Promise<void> {
    return this.recorder.record({
      type: ACTIVITY_TYPES.recoShown,
      subjectType: lead.subjectType,
      subjectId: lead.subjectId,
      idempotencyKey: `${ACTIVITY_TYPES.recoShown}:${lead.subjectType}:${lead.subjectId}:${lead.computedAt}`,
      // Le cockpit recommande, pas celui qui l'ouvre — et la clé ne dépend pas
      // de lui : seul le premier lecteur de la fenêtre aurait été inscrit.
      bySystem: true,
      payload: {
        ...label,
        play: lead.play,
        score: lead.score,
      },
    });
  }
}

/**
 * Le nom du sujet : le libellé du read-model — son enseigne —, sauf quand il
 * n'est que l'id faute de nom (`deriveActivations`).
 */
function labelOf(lead: LeadScoreView): { readonly subjectLabel?: string } {
  return lead.label === "" || lead.label === lead.subjectId ? {} : { subjectLabel: lead.label };
}
