import {
  startingMailDocument,
  type MailDocument,
  type MailEditorPublishedView,
  type MailEditorStamp,
  type MailEditorView,
} from "@lfd/mail-blocks";
import type { MailCopyManifest } from "../../copy/domain/mail-copy-manifest.js";
import type { MailSectionOrderState } from "../../copy/domain/mail-section-order.js";
import { replacementSectionOrders } from "../../copy/domain/mail-section-orders.js";
import type { MailTemplatePhrases } from "./mail-editor-phrases.js";
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

/** Ce que l'éditeur ouvre pour un e-mail : rien n'est écrit pour l'ouvrir. */
export function mailEditorView(
  entry: MailTemplateEntry,
  state: MailTemplateDocumentState | null,
  starting: MailDocument,
  phrases: MailTemplatePhrases,
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
    phrases: phrases.phrases,
    cases: entry.cases,
    orphans: phrases.orphans,
    resources: entry.resources,
    situations: entry.situations,
  };
}
