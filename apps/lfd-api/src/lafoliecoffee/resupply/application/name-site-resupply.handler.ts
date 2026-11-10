import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { ResupplySiteUnknownError } from "../domain/resupply-site-errors.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import {
  SiteResupplyChangedMeanwhileError,
  SiteResupplyDraftOpenedMeanwhileError,
} from "../domain/site-resupply-errors.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { NameSiteResupplyCommand } from "./name-site-resupply.command.js";
import { currentDraft } from "./site-resupply-draft.js";

/**
 * **Nomme la demande en cours** (R1g, Hugo 2026-10-21 : « vitrine du
 * matin »). La demande de la visée est ouverte si aucune ne l'est, comme
 * pour un ajout : on peut nommer avant le premier article.
 *
 * **Sans version attendue : le dernier nom posé l'emporte**, et il ne touche
 * pas aux lignes. Le contrat le promettait, mais un ajout ou une ouverture
 * concurrents faisaient échouer le nom sur la version (audit final,
 * 2026-11-03) : il est désormais reposé sur la demande RELUE, jusqu'à
 * {@link NAME_ATTEMPTS} fois. Le nom ne dépend d'aucun autre état — le
 * reposer sur une version plus fraîche ne perd rien de ce que l'autre poste
 * a écrit.
 */
/** Au-delà, la demande bouge sans cesse : le refus (409) dit de recharger. */
export const NAME_ATTEMPTS = 3;

@CommandHandler(NameSiteResupplyCommand)
export class NameSiteResupplyHandler implements ICommandHandler<NameSiteResupplyCommand, string> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly sites: ResupplySites,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: NameSiteResupplyCommand): Promise<string> {
    if (!(await this.sites.exists(command.siteId))) {
      throw new ResupplySiteUnknownError(command.siteId);
    }
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.rename(command);
      } catch (error) {
        if (!isRaceOnTheDraft(error) || attempt >= NAME_ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  private async rename(command: NameSiteResupplyCommand): Promise<string> {
    const draft = await currentDraft(this.resupplies, this.ids, {
      siteId: command.siteId,
      target: command.target,
      at: this.clock.now(),
    });
    draft.rename(command.name);
    await this.resupplies.save(draft);
    return draft.id;
  }
}

/** Un autre poste a écrit (ou ouvert) la demande entre la lecture et l'écriture. */
function isRaceOnTheDraft(error: unknown): boolean {
  return (
    error instanceof SiteResupplyChangedMeanwhileError ||
    error instanceof SiteResupplyDraftOpenedMeanwhileError
  );
}
