import { renderMailDocument, type LayoutInput } from "@lfd/mailer";

import type { B2bMails } from "../mail-templates.js";
import { mailBlockDeclarationOf } from "./mail-block-declarations.js";
import { documentOfRenderedMail } from "./mail-layout-scope.js";
import { MAIL_LAYOUTS } from "./mail-layouts.js";

function isRegisteredMail(mail: string): mail is keyof B2bMails {
  return Object.hasOwn(MAIL_LAYOUTS, mail);
}

/**
 * **Le rendu par document de l'e-mail en cours** (plan
 * `plan-editeur-par-blocs.md`, S4b) : `null` quand le périmètre ne lui donne
 * pas de document — la coquille rend alors comme avant. La charte et les
 * sections déclarées viennent du code (`mailBlockDeclarationOf`,
 * `MAIL_LAYOUTS`), jamais du document.
 */
export function renderDocumentOfRenderedMail(input: LayoutInput): string | null {
  const current = documentOfRenderedMail();
  if (current === undefined || !isRegisteredMail(current.mail)) {
    return null;
  }
  return renderMailDocument(input, current.scoped.document, {
    charter: mailBlockDeclarationOf(current.mail).charter,
    locale: current.scoped.locale,
    declaredSections: MAIL_LAYOUTS[current.mail].sections.map((section) => section.id),
  });
}
