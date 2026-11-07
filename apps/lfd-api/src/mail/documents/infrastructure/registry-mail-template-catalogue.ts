import { Injectable } from "@nestjs/common";

import { audienceOf } from "../../copy/domain/mail-copy-manifest.js";
import { mailResourcesOf } from "../../templates/resources/mail-resources.js";
import { mailBlockDeclarationOf } from "../../templates/sections/mail-block-declarations.js";
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
  };
}

/** Le registre RÉEL des e-mails, dans l'ordre des exemples (commande, compte, équipe). */
@Injectable()
export class RegistryMailTemplateCatalogue extends MailTemplateCatalogue {
  private readonly entries: readonly MailTemplateEntry[] = mailKeys().map(entryOf);

  list(): readonly MailTemplateEntry[] {
    return this.entries;
  }

  find(template: string): MailTemplateEntry | null {
    return isMailKey(template) ? entryOf(template) : null;
  }
}
