import type { MailLocale } from "@lfd/mail-blocks";
import {
  renderMailDocument,
  renderMailDocumentText,
  type LayoutInput,
  type MailDocumentRenderOptions,
} from "@lfd/mailer";

import type { B2bMails } from "../mail-templates.js";
import { mailBlockDeclarationOf } from "./mail-block-declarations.js";
import { documentOfRenderedMail } from "./mail-layout-scope.js";
import { MAIL_LAYOUTS } from "./mail-layouts.js";

function isRegisteredMail(mail: string): mail is keyof B2bMails {
  return Object.hasOwn(MAIL_LAYOUTS, mail);
}

/**
 * Ce que le rendu d'un document lit du CODE pour un e-mail : sa charte et ses
 * sections déclarées. Partagé par l'envoi et l'aperçu de l'éditeur (S5f).
 */
export function documentRenderOptionsOf(
  mail: keyof B2bMails,
  locale: MailLocale,
): MailDocumentRenderOptions {
  return {
    charter: mailBlockDeclarationOf(mail).charter,
    locale,
    declaredSections: MAIL_LAYOUTS[mail].sections.map((section) => section.id),
  };
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
    ...documentRenderOptionsOf(current.mail, current.scoped.locale),
    ...(current.scoped.framePreviewImages === true ? { framePreviewImages: true } : {}),
  });
}

/**
 * **La version texte du document de l'e-mail en cours** (2026-11-08) : le
 * pendant de `renderDocumentOfRenderedMail`, depuis le même périmètre ;
 * `null` sans document — la coquille dit alors son texte.
 */
export function renderDocumentTextOfRenderedMail(input: LayoutInput): string | null {
  const current = documentOfRenderedMail();
  if (current === undefined || !isRegisteredMail(current.mail)) {
    return null;
  }
  return renderMailDocumentText(
    input,
    current.scoped.document,
    documentRenderOptionsOf(current.mail, current.scoped.locale),
  );
}
