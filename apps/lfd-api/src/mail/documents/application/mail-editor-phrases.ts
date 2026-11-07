import {
  MAIL_LOCALES,
  modelSectionOfLayoutSection,
  type MailEditorPhraseLocaleView,
  type MailEditorPhrasePlace,
  type MailEditorPhraseView,
} from "@lfd/mail-blocks";
import type {
  MailCopyAdminView,
  MailCopyLocaleView,
  MailCopyMailView,
  MailCopyTextView,
  MailSectionTextView,
} from "@lfd/contracts";

import { mailCopyAdminView } from "../../copy/application/mail-copy-admin-view.js";
import type { MailCopyEntryState } from "../../copy/domain/mail-copy-entry.js";
import type { MailCopyManifest } from "../../copy/domain/mail-copy-manifest.js";
import type { MailSectionOrderState } from "../../copy/domain/mail-section-order.js";
import type { MailCopyPublicationState } from "../../copy/domain/ports/mail-copy-admin.reader.js";

/** Les phrases d'un e-mail et ses orphelines, telles que l'éditeur les sert. */
export interface MailTemplatePhrases {
  readonly phrases: readonly MailEditorPhraseView[];
  readonly orphans: readonly MailEditorPhraseView[];
}

/** Où une phrase se range dans l'e-mail, et le nom de sa variante. */
interface PhraseSlot {
  readonly place: MailEditorPhrasePlace;
  readonly variant: string | null;
}

function phraseLocale(view: MailCopyLocaleView): MailEditorPhraseLocaleView {
  return {
    default: view.default,
    draftState: view.draftState,
    draftText: view.draftText,
    publishedText: view.publishedText,
    revision: view.revision,
    defaultChangedSince: view.defaultChangedSince,
  };
}

/**
 * La carte d'un e-mail, telle que l'écran des textes la lit (`frames`,
 * `sections`) : chemin → bloc du modèle ou cadre, et variante. Un identifiant
 * de section que les blocs du modèle ne connaissent pas laisse ses phrases
 * hors carte plutôt que d'en inventer un.
 */
function slotsOf(mail: MailCopyMailView): ReadonlyMap<string, PhraseSlot> {
  const slots = new Map<string, PhraseSlot>();
  const put = (texts: readonly MailSectionTextView[], place: MailEditorPhrasePlace): void => {
    for (const text of texts) {
      slots.set(text.path, { place, variant: text.variant });
    }
  };
  put(mail.frames.subject, { kind: "frame", frame: "subject" });
  put(mail.frames.header, { kind: "frame", frame: "header" });
  for (const section of mail.sections) {
    const block = modelSectionOfLayoutSection(section.id);
    if (block !== null) {
      put(section.texts, { kind: "block", block });
    }
  }
  return slots;
}

function phraseView(text: MailCopyTextView, slot: PhraseSlot | undefined): MailEditorPhraseView {
  return {
    path: text.path,
    variables: text.variables,
    requiredVariables: text.requiredVariables,
    locales: {
      fr: phraseLocale(text.locales.fr),
      en: phraseLocale(text.locales.en),
      it: phraseLocale(text.locales.it),
    },
    place: slot?.place ?? null,
    variant: slot?.variant ?? null,
    staleTranslations: MAIL_LOCALES.filter((locale) => text.staleTranslations.includes(locale)),
  };
}

/**
 * Les phrases d'UN e-mail et ses orphelines, tirées de la vue de l'écran des
 * textes (`admin/mail-copy`) : une seule source (§ 3, § 21) — rangement,
 * variantes et signaux y sont déjà calculés, rien n'est recalculé ici.
 */
export function phrasesOfMail(view: MailCopyAdminView, template: string): MailTemplatePhrases {
  const mail = view.mails.find((candidate) => candidate.mail === template);
  const slots = mail === undefined ? new Map<string, PhraseSlot>() : slotsOf(mail);
  return {
    phrases: (mail?.texts ?? []).map((text) => phraseView(text, slots.get(text.path))),
    orphans: view.orphans
      .filter((orphan) => orphan.mail === template)
      .map((orphan) => phraseView(orphan, undefined)),
  };
}

/** Les phrases d'un e-mail, à partir des lectures de l'écran des textes. */
export function phrasesOfTemplate(
  template: string,
  manifest: MailCopyManifest,
  entries: readonly MailCopyEntryState[],
  publication: MailCopyPublicationState,
  orders: readonly MailSectionOrderState[],
): MailTemplatePhrases {
  return phrasesOfMail(mailCopyAdminView(manifest, entries, publication, orders), template);
}
