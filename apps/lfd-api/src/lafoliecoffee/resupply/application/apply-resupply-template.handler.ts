import {
  type AppliedResupplyTemplateResponse,
  RESUPPLY_TEMPLATE_LINE_ISSUES,
  type SkippedResupplyTemplateLine,
} from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import {
  type IntentCodec,
  OncePerIntent,
  readIntentString,
} from "../../../platform/intent/once-per-intent.js";
import { IntentRecordUnreadableError } from "../../../platform/intent/intent-errors.js";
import { intentSubject } from "../../../platform/intent/intent-subject.js";
import { Clock } from "../../../platform/time/clock.js";
import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { ResupplySiteUnknownError } from "../domain/resupply-site-errors.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import type { ResupplyTemplate } from "../domain/resupply-template.js";
import { ResupplyTemplateNotFoundError } from "../domain/resupply-template-errors.js";
import { ResupplyTemplateRepository } from "../domain/resupply-template.repository.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { ApplyResupplyTemplateCommand } from "./apply-resupply-template.command.js";
import {
  applyTemplateLines,
  copyTemplateArrival,
  sortTemplateLines,
} from "./resupply-template-applying.js";
import { loadResupplyTemplate } from "./resupply-template-support.js";
import { currentDraft } from "./site-resupply-draft.js";

/**
 * **Applique un modèle à la demande en cours** (plan
 * `documentation/reassort-boutiques/commander.md § 6`, § 4) :
 * le modèle actif du point, ses lignes confrontées au catalogue du réassort
 * (les inapplicables écartées et rendues), posées sur la demande en cours de
 * la visée — ouverte si aucune ne l'est. Un réassort envoyé n'est jamais
 * touché : seul le brouillon est la demande en cours. Une demande sans nom
 * prend celui du modèle, une demande « pour demain » sans heure, la sienne
 * (H1).
 *
 * **Une fois par intention** : en `add`, la même requête renvoyée doublerait
 * les quantités. La clé de l'écran est scellée dans la transaction de
 * l'écriture ; un second envoi rend la même réponse sans rien réappliquer.
 *
 * @throws {ResupplyTemplateNotFoundError} modèle inconnu, ou d'un autre point.
 * @throws {ResupplyTemplateArchivedError} modèle archivé.
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour une autre application.
 */
@CommandHandler(ApplyResupplyTemplateCommand)
export class ApplyResupplyTemplateHandler implements ICommandHandler<
  ApplyResupplyTemplateCommand,
  AppliedResupplyTemplateResponse
> {
  constructor(
    private readonly resupplies: SiteResupplyRepository,
    private readonly templates: ResupplyTemplateRepository,
    private readonly catalogue: ResupplyCatalogue,
    private readonly sites: ResupplySites,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: ApplyResupplyTemplateCommand): Promise<AppliedResupplyTemplateResponse> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: APPLY_TEMPLATE_GESTURE,
        subject: intentSubject(command.siteId, command.target, command.templateId, command.mode),
      },
      APPLIED_REPLAY,
      (seal) => this.apply(command, seal),
    );
  }

  private async apply(
    command: ApplyResupplyTemplateCommand,
    seal: (result: AppliedResupplyTemplateResponse) => Promise<void>,
  ): Promise<AppliedResupplyTemplateResponse> {
    if (!(await this.sites.exists(command.siteId))) {
      throw new ResupplySiteUnknownError(command.siteId);
    }
    const template = await this.siteTemplate(command);
    const { applicable, skipped } = sortTemplateLines(template, await this.catalogue.articles());
    const draft = await currentDraft(this.resupplies, this.ids, {
      siteId: command.siteId,
      target: command.target,
      at: this.clock.now(),
    });
    applyTemplateLines(draft, template, applicable, command.mode);
    if (draft.name === null) {
      draft.rename(template.content.name);
    }
    copyTemplateArrival(draft, template);
    const result = { resupplyId: draft.id, skipped };
    await this.uow.run(async () => {
      await this.resupplies.save(draft);
      await seal(result);
    });
    return result;
  }

  /** Le modèle actif du point de l'URL : celui d'un autre point est introuvable. */
  private async siteTemplate(command: ApplyResupplyTemplateCommand): Promise<ResupplyTemplate> {
    const template = await loadResupplyTemplate(this.templates, command.templateId);
    if (template.siteId !== command.siteId) {
      throw new ResupplyTemplateNotFoundError(command.templateId);
    }
    template.assertApplicable();
    return template;
  }
}

/** Le nom stable du geste, dans le registre des intentions. */
const APPLY_TEMPLATE_GESTURE = "resupply.apply-template";

/**
 * Ce que l'application rend, gardé pour le rejeu : la demande, et les lignes
 * écartées rangées en une chaîne (le registre ne garde que des scalaires),
 * relues et vérifiées une à une.
 */
const APPLIED_REPLAY: IntentCodec<AppliedResupplyTemplateResponse> = {
  write: (result) => ({ resupplyId: result.resupplyId, skipped: JSON.stringify(result.skipped) }),
  read: (record, gesture) => ({
    resupplyId: readIntentString(record, "resupplyId", gesture),
    skipped: skippedOf(readIntentString(record, "skipped", gesture), gesture),
  }),
};

function skippedOf(raw: string, gesture: string): readonly SkippedResupplyTemplateLine[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new IntentRecordUnreadableError(gesture, "skipped");
  }
  return parsed.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null || !("sku" in entry) || !("reason" in entry)) {
      throw new IntentRecordUnreadableError(gesture, "skipped");
    }
    const { sku, reason } = entry;
    const known = RESUPPLY_TEMPLATE_LINE_ISSUES.find((issue) => issue === reason);
    if (typeof sku !== "string" || known === undefined) {
      throw new IntentRecordUnreadableError(gesture, "skipped");
    }
    return { sku, reason: known };
  });
}
