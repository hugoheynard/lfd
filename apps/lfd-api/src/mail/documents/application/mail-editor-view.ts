import {
  startingMailDocument,
  type MailDocument,
  type MailEditorPhraseView,
  type MailEditorPublishedView,
  type MailEditorStamp,
  type MailEditorView,
} from "@lfd/mail-blocks";
import type { MailCopyLocaleView, MailCopyMailView } from "@lfd/contracts";

import { mailCopyAdminView } from "../../copy/application/mail-copy-admin-view.js";
import type { MailCopyEntryState } from "../../copy/domain/mail-copy-entry.js";
import type { MailCopyPublicationState } from "../../copy/domain/ports/mail-copy-admin.reader.js";

import type { MailCopyManifest } from "../../copy/domain/mail-copy-manifest.js";
import type { MailSectionOrderState } from "../../copy/domain/mail-section-order.js";
import { replacementSectionOrders } from "../../copy/domain/mail-section-orders.js";
import type { MailTemplateEntry } from "../domain/ports/mail-template-catalogue.js";
import {
  MailTemplateDocument,
  type MailDocumentStamp,
  type MailTemplateDocumentState,
} from "../domain/mail-template-document.js";

/** Un geste daté, tel que l'écran le lit. */
export function stampView(stamp: MailDocumentStamp): MailEditorStamp {
  return { at: stamp.at.toISOString(), staffId: stamp.staffId };
}

/** Le document publié d'un e-mail, tel que la liste et l'éditeur le montrent. */
export function publishedView(
  state: MailTemplateDocumentState | null,
): MailEditorPublishedView | null {
  const published = state?.published ?? null;
  return published === null ? null : { version: published.version, ...stampView(published.stamp) };
}

/**
 * **Le document de départ** (plan § 3) : l'ordre publié de l'ancienne table
 * (`public.mail_section_orders`) s'il y en a un, sinon celui du code. Calculé,
 * jamais écrit.
 */
export function startingDocumentOf(
  entry: MailTemplateEntry,
  orders: readonly MailSectionOrderState[],
  manifest: MailCopyManifest,
): MailDocument {
  const published = replacementSectionOrders(orders, manifest, "published")[entry.template];
  return startingMailDocument(entry.template, entry.declaration, published);
}

function phraseLocale(view: MailCopyLocaleView) {
  return {
    default: view.default,
    draftState: view.draftState,
    draftText: view.draftText,
    publishedText: view.publishedText,
    revision: view.revision,
  };
}

/** Les phrases du modèle et leurs variantes, tirées de l'écran des textes des e-mails. */
export function phraseViews(mail: MailCopyMailView | undefined): readonly MailEditorPhraseView[] {
  return (mail?.texts ?? []).map((text) => ({
    path: text.path,
    variables: text.variables,
    requiredVariables: text.requiredVariables,
    locales: {
      fr: phraseLocale(text.locales.fr),
      en: phraseLocale(text.locales.en),
      it: phraseLocale(text.locales.it),
    },
  }));
}

/**
 * Les phrases d'UN e-mail, tirées de la vue de l'écran des textes : une seule
 * source, la même que `admin/mail-copy` (§ 3).
 */
export function phrasesOfTemplate(
  template: string,
  manifest: MailCopyManifest,
  entries: readonly MailCopyEntryState[],
  publication: MailCopyPublicationState,
  orders: readonly MailSectionOrderState[],
): readonly MailEditorPhraseView[] {
  const texts = mailCopyAdminView(manifest, entries, publication, orders).mails.find(
    (mail) => mail.mail === template,
  );
  return phraseViews(texts);
}

/** Ce que l'éditeur ouvre pour un e-mail : rien n'est écrit pour l'ouvrir. */
export function mailEditorView(
  entry: MailTemplateEntry,
  state: MailTemplateDocumentState | null,
  starting: MailDocument,
  phrases: readonly MailEditorPhraseView[],
): MailEditorView {
  const document =
    state === null
      ? MailTemplateDocument.untouched(entry.template)
      : MailTemplateDocument.reconstitute(state);
  const current = document.current(starting);
  const draft = state?.draft ?? null;
  return {
    template: entry.template,
    audience: entry.audience,
    family: entry.family,
    declaration: entry.declaration,
    document: current.document,
    source: current.source,
    revision: state?.revision ?? 0,
    published: publishedView(state),
    draft: draft === null ? null : stampView(draft.stamp),
    phrases,
    cases: entry.cases,
  };
}
