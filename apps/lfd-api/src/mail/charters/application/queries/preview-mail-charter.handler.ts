import {
  validateMailCharter,
  type MailCharterPreviewView,
  type MailCharterSettings,
  type MailSpace,
} from "@lfd/mail-blocks";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  MailCharterRefusedError,
  MailTemplateOutsideSpaceError,
} from "../../domain/mail-charter-errors.js";
import { MailSpaceCharter } from "../../domain/mail-space-charter.js";
import { MailCharterPreviewRenderer } from "../../domain/ports/mail-charter-preview.renderer.js";
import { MailCharterReader } from "../../domain/ports/mail-charter.reader.js";
import { MailSpaceDirectory } from "../../domain/ports/mail-space-directory.js";
import { mailSpaceOfParam } from "../mail-space-param.js";
import { PreviewMailCharterQuery } from "./preview-mail-charter.query.js";

/**
 * **L'aperçu de la charte** (plan `plan-editeur-par-blocs.md`, § 25) :
 * l'exemple d'un e-mail de l'espace, rendu avec les réglages de l'écran — le
 * brouillon qu'on règle, avant même de l'enregistrer. Les règles de forme
 * s'appliquent (une couleur illisible ne se rend pas) ; celles de la
 * publication non : on prévisualise justement pour corriger un contraste.
 */
@QueryHandler(PreviewMailCharterQuery)
export class PreviewMailCharterHandler implements IQueryHandler<
  PreviewMailCharterQuery,
  MailCharterPreviewView
> {
  constructor(
    private readonly reader: MailCharterReader,
    private readonly directory: MailSpaceDirectory,
    private readonly renderer: MailCharterPreviewRenderer,
  ) {}

  /**
   * @throws {UnknownMailSpaceError} l'espace n'existe pas.
   * @throws {MailTemplateOutsideSpaceError} l'e-mail n'est pas de cet espace.
   * @throws {MailCharterRefusedError} un réglage enfreint une règle de forme.
   */
  async execute(query: PreviewMailCharterQuery): Promise<MailCharterPreviewView> {
    const space = mailSpaceOfParam(query.space);
    const templates = this.directory.templatesOf(space);
    const template = query.template ?? templates[0] ?? "";
    if (!templates.includes(template)) {
      throw new MailTemplateOutsideSpaceError(space, template);
    }
    const settings = query.settings ?? (await this.currentSettings(space));
    const violations = validateMailCharter(settings);
    if (violations.length > 0) {
      throw new MailCharterRefusedError(space, "prévisualisée", violations);
    }
    const rendered = await this.renderer.render(template, query.locale, settings);
    return { space, template, locale: query.locale, ...rendered };
  }

  private async currentSettings(space: MailSpace): Promise<MailCharterSettings> {
    const state = await this.reader.stateOf(space);
    const charter =
      state === null ? MailSpaceCharter.untouched(space) : MailSpaceCharter.reconstitute(state);
    return charter.current(this.directory.startingSettings(space)).settings;
  }
}
