import { Injectable } from "@nestjs/common";

import { audienceOf } from "../../copy/domain/mail-copy-manifest.js";
import { mailResourcesOf } from "../../templates/resources/mail-resources.js";
import {
  editorMails,
  isInMailEditor,
  mailBlockDeclarationOf,
} from "../../templates/sections/mail-block-declarations.js";
import { mailSituationsOf } from "../../templates/specimens/cases/mail-situations.js";
import { mailCasesOf } from "../../templates/specimens/cases/mail-specimen-cases.js";
import { isMailKey, mailFamilyOf, mailKeys } from "../../templates/specimens/mail-specimens.js";
import type { B2bMails } from "../../templates/mail-templates.js";
import {
  MailTemplateCatalogue,
  type MailTemplateEntry,
} from "../domain/ports/mail-template-catalogue.js";

function entryOf(template: keyof B2bMails): MailTemplateEntry {
  return {
    template,
    audience: audienceOf(template),
    family: mailFamilyOf(template),
    declaration: mailBlockDeclarationOf(template),
    cases: mailCasesOf(template),
    resources: mailResourcesOf(template),
    situations: mailSituationsOf(template),
  };
}

/**
 * Le registre RÉEL des e-mails, dans l'ordre des exemples (commande, compte,
 * équipe), sans ceux qui ne sont pas à l'éditeur (`outOfEditor` — la sonde de
 * déploiement) : absents de la liste, introuvables à l'ouverture (404 nommé).
 */
@Injectable()
export class RegistryMailTemplateCatalogue extends MailTemplateCatalogue {
  private readonly entries: readonly MailTemplateEntry[] = editorMails(mailKeys()).map(entryOf);

  list(): readonly MailTemplateEntry[] {
    return this.entries;
  }

  find(template: string): MailTemplateEntry | null {
    return isMailKey(template) && isInMailEditor(template) ? entryOf(template) : null;
  }
}
