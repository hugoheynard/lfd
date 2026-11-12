import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import {
  type IntentCodec,
  OncePerIntent,
  readIntentString,
} from "../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../platform/intent/intent-subject.js";
import { Clock } from "../../../platform/time/clock.js";
import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { ResupplySiteUnknownError } from "../domain/resupply-site-errors.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { AddSiteResupplyLineCommand } from "./add-site-resupply-line.command.js";
import { addArticle, currentDraft } from "./site-resupply-draft.js";

/**
 * **Ajoute un article à la demande en cours** (R1c). La demande de la
 * visée est ouverte si aucune ne l'est — après un envoi, le prochain ajout
 * en ouvre une nouvelle ; un article déjà présent voit sa quantité
 * s'additionner. Sans version attendue : deux ajouts se cumulent, et une
 * course réelle (deux postes, même instant) est refusée par le verrou.
 *
 * **Une fois par intention** : l'ajout est RELATIF, donc la même requête
 * renvoyée (réseau, double envoi) additionnerait deux fois. La clé de l'écran
 * — une par geste voulu — est scellée dans la transaction de l'écriture ; un
 * second envoi de même clé rend la même demande sans rien additionner. Deux
 * gestes voulus (« +1 » puis « +1 ») portent deux clés, et se cumulent.
 *
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour un autre ajout.
 */
@CommandHandler(AddSiteResupplyLineCommand)
export class AddSiteResupplyLineHandler implements ICommandHandler<
  AddSiteResupplyLineCommand,
  string
> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly catalogue: ResupplyCatalogue,
    private readonly sites: ResupplySites,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: AddSiteResupplyLineCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: ADD_LINE_GESTURE,
        subject: intentSubject(command.siteId, command.target, command.sku, command.quantity),
      },
      DRAFT_ID_REPLAY,
      (seal) => this.add(command, seal),
    );
  }

  private async add(
    command: AddSiteResupplyLineCommand,
    seal: (draftId: string) => Promise<void>,
  ): Promise<string> {
    if (!(await this.sites.exists(command.siteId))) {
      throw new ResupplySiteUnknownError(command.siteId);
    }
    const draft = await currentDraft(this.resupplies, this.ids, {
      siteId: command.siteId,
      target: command.target,
      at: this.clock.now(),
    });
    await addArticle(this.catalogue, draft, command);
    await this.uow.run(async () => {
      await this.resupplies.save(draft);
      await seal(draft.id);
    });
    return draft.id;
  }
}

/** Le nom stable du geste, dans le registre des intentions. */
const ADD_LINE_GESTURE = "resupply.add-draft-line";

/** Ce que l'ajout rend : l'identifiant de la demande. */
const DRAFT_ID_REPLAY: IntentCodec<string> = {
  write: (draftId) => ({ draftId }),
  read: (record, gesture) => readIntentString(record, "draftId", gesture),
};
