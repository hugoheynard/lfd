import { Injectable } from "@nestjs/common";

import { audienceOf } from "../../copy/domain/mail-copy-manifest.js";
import { mailBlockDeclarationOf } from "../../templates/sections/mail-block-declarations.js";
import { isMailKey, mailFamilyOf, mailKeys } from "../../templates/specimens/mail-specimens.js";
import type { B2bMails } from "../../templates/mail-templates.js";
import {
  MailTemplateCatalogue,
  type MailTemplateEntry,
} from "../domain/ports/mail-template-catalogue.js";

/**
 * Le seul cas que l'aperçu sait rendre aujourd'hui : l'exemple de l'e-mail
 * (`mail/templates/specimens/`). Les autres jeux de données (payé, à régler,
 * au compte…) ne vivent que dans les tests des empreintes
 * (`templates/__tests__/rendering-golden/`), vérifié le 2026-11-07 : les
 * servir demandera de les sortir des tests (plan, S4c, écarts).
 */
const SPECIMEN_CASE = { id: "specimen", label: "Exemple" } as const;

function entryOf(template: keyof B2bMails): MailTemplateEntry {
  return {
    template,
    audience: audienceOf(template),
    family: mailFamilyOf(template),
    declaration: mailBlockDeclarationOf(template),
    cases: [SPECIMEN_CASE],
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
